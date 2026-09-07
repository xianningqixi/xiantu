#!/usr/bin/env python3
"""Static specification checks only. Does not implement or test the game."""
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []
checks = 0

def check(ok, message):
    global checks
    checks += 1
    if not ok:
        errors.append(message)

def read_json(rel):
    try:
        return json.loads((ROOT / rel).read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        errors.append(f'{rel}: {exc}')
        return {}

def walk(value, path=''):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from walk(child, f'{path}.{key}' if path else key)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            yield from walk(child, f'{path}[{i}]')
    else:
        yield path, value

def resolve(value, path):
    for part in path.split('.'):
        value = value[part]
    return value

b = read_json('content/prototype-balance.json')
s = read_json('content/storylets.json')
a = read_json('content/assets.json')
r = read_json('content/registries.json')
check(b.get('configVersion') == 'prototype-0.1.1', 'wrong balance version')
for key, value in walk(b):
    if key.split('.')[-1].endswith('Bp'):
        check(type(value) is int and 0 <= value <= 10000, f'invalid probability: {key}')
check(type(b['world']['exampleSeed']) is int and 0 <= b['world']['exampleSeed'] <= 0xffffffff, 'world seed must be uint32')
check(b['world']['initialNpcCount'] == 40, 'expected 40 NPC including fixed NPCs')
check(b['combat']['partyMaxSize'] == 3, 'party maximum must remain 3')
check(b['creation']['rerollLimit'] is None, 'rerolls must stay unlimited')
check(b['cultivation']['breakthrough']['canDieFromFailure'] is False, 'breakthrough failure cannot kill')
check(b['cultivation']['breakthrough']['healthLossOnFailure'] == 0, 'prototype failure must not drain health')
check(b['cultivation']['breakthrough']['severeLossMayCrossMajorRealm'] is False, 'prototype must not cross an earned major realm on failure')
check(b['cultivation']['minorAdvanceAutoForPlayerAndNpc'] is True, 'minor advancement needs an executable shared path')
check(b['modes']['complex']['actualDeathEndsRun'] is True, 'complex actual death must end run')
check(b['actions']['workSpiritStoneReward'] > 0 and b['actions']['workHasFailureRisk'] is False, 'safe income route missing')
check(b['cultivation']['methods']['METHOD_BASIC']['costSpiritStonesPerDay'] == 0, 'free training route missing')
check(b['economy']['manualPublicFallbackRequiresNpc'] is False and b['economy']['manualClaimKey'] == 'starter-manual', 'manual fallback/claim mismatch')
check(b['presentation']['closedTabAdvancesWorld'] is False, 'closed-tab time must not advance')
check(len(b['world']['stressTestSeeds']) == 5, 'five stress seeds required')
check(b['combat']['nonlethalVictoryDownedHpRestoreBp'] > 0, 'victory recovery path missing')
check(b['story']['departureFeePerNpc'] == 1, 'story fee expected to resolve to one stone per NPC')
check(b['story']['reunionWaitDays'] == 3, 'story reunion default mismatch')
check(b['promises']['allowReturnTravelWithLockedLoot'] is True, 'loot must be able to return to settlement location')

nodes = s.get('storylets', [])
assets = a.get('assets', [])
node_ids = [n.get('id') for n in nodes]
asset_ids = [n.get('id') for n in assets]
check(len(node_ids) == len(set(node_ids)) == 14, 'expected 14 unique storylets')
check(len(asset_ids) == len(set(asset_ids)) == 8, 'expected 8 unique assets')
check(s.get('entryStoryletId') in node_ids, 'unknown story entry')
actors = {'PLAYER', *b['world']['fixedNpcIds']}
scopes = set(r['scopeIds'])
locations = set(b['locations'])
items = {x['id'] for x in r['items']}
check(set(b['economy']['shopPrices']).issubset(items), 'unknown shop items')
asset_map = {x['id']: x for x in assets}
allowed_commands = set(re.findall(r"'([A-Z][A-Za-z]+)'", (ROOT/'contracts/game.ts').read_text()))
commands = {
    'Talk': ({'targetId', 'topicId'}, {'targetId', 'topicId', 'claimId'}),
    'OpenProfile': (set(), {'entityId', 'tab', 'view', 'storyScopeId'}),
    'LeaveInteraction': (set(), {'destinationView'}),
    'AdvanceDialogue': ({'topicId'}, {'topicId'}),
    'Travel': ({'toLocationId'}, {'toLocationId'}),
    'StartTraining': ({'actorId', 'methodId', 'durationDays'}, {'actorId', 'methodId', 'durationDays'}),
    'StartBreakthrough': ({'actorId', 'targetRealmId', 'usePill', 'guardianId'}, {'actorId', 'targetRealmId', 'usePill', 'guardianId'}),
    'ProposeAgreement': ({'storyScopeId', 'templateId', 'participantIds'}, {'storyScopeId', 'templateId', 'participantIds'}),
    'AcceptAgreement': ({'storyScopeId'}, {'storyScopeId'}),
    'FormParty': ({'storyScopeId', 'memberIds'}, {'storyScopeId', 'memberIds'}),
    'StartExpedition': ({'storyScopeId', 'destinationId'}, {'storyScopeId', 'destinationId'}),
    'AllocateLoot': ({'storyScopeId', 'policy'}, {'storyScopeId', 'policy'}),
}
fields = {
    'entity': {'alive': bool, 'locationId': str, 'realmTier': int},
    'fact': {'lin.firstMeetingRecorded': bool, 'lin.manualClaimed': bool, 'lin.goalKnown': bool,
             'lin.storySettlementResult': str, 'lin.reunionRecorded': bool, 'player.canBreakthroughToQi': bool},
    'agreement': {'status': str},
    'party': {'memberCount': int, 'memberIds': list},
    'expedition': {'phase': str, 'hasPromisedGrass': bool, 'settlementReady': bool, 'exceptionSettlementRequired': bool},
    'clock': {'daysSinceStorySettlement': int},
}
ops = {'eq', 'ne', 'gte', 'in', 'contains'}
status_values = set(b['promises']['states']) | {'none'}

def validate_condition(c, path):
    check(set(c) == {'kind', 'subjectId', 'key', 'op', 'value'}, f'{path}: invalid condition shape')
    kind, key, op, value = c['kind'], c['key'], c['op'], c['value']
    check(kind in fields and key in fields.get(kind, {}), f'{path}: unknown condition field')
    check(op in ops, f'{path}: unknown comparison')
    check(c['subjectId'] in (actors if kind == 'entity' else scopes), f'{path}: invalid subject')
    if isinstance(value, dict):
        check(set(value) == {'ruleRef'} and value.get('ruleRef') in r['allowedRuleRefs'], f'{path}: invalid ruleRef')
        try:
            value = resolve(b, value['ruleRef'])
        except KeyError:
            errors.append(f'{path}: missing ruleRef')
            return
    expected = fields.get(kind, {}).get(key)
    if expected is None:
        return
    if op == 'in':
        check(type(value) is list and all(type(v) is expected for v in value), f'{path}: invalid enum array')
    elif op == 'contains':
        check(expected is list and isinstance(value, str) and value in actors, f'{path}: invalid membership')
    else:
        check(type(value) is expected, f'{path}: invalid value type')
    if op == 'gte':
        check(expected is int, f'{path}: gte requires integer field')
    if kind == 'agreement':
        vals = value if op == 'in' else [value]
        check(all(v in status_values for v in vals), f'{path}: invalid agreement status')
    if kind == 'expedition' and key == 'phase':
        vals = value if op == 'in' else [value]
        check(all(v in {'none','ready','active','resolved','settled'} for v in vals), f'{path}: invalid expedition phase')

for n in nodes:
    path = n['id']
    required = {'id','title','locationId','participantIds','backgroundAssetId','portraitAssetIds','body','conditions','choices','once','cooldownDays'}
    check(required.issubset(n), f'{path}: missing story fields')
    check(n['locationId'] in locations, f'{path}: unknown location')
    check(set(n['participantIds']).issubset(actors), f'{path}: unknown participant')
    check(n['backgroundAssetId'] in asset_map, f'{path}: unknown background')
    if n['backgroundAssetId'] in asset_map:
        check(asset_map[n['backgroundAssetId']]['locationId'] == n['locationId'], f'{path}: background location mismatch')
    for portrait in n['portraitAssetIds']:
        check(portrait in asset_map, f'{path}: missing portrait')
        if portrait in asset_map:
            check(asset_map[portrait]['entityId'] in n['participantIds'], f'{path}: portrait identity not present')
    check(type(n['once']) is bool and type(n['cooldownDays']) is int and n['cooldownDays'] >= 0, f'{path}: repeat policy malformed')
    check(n['body'].strip() != '', f'{path}: empty body')
    choice_ids = [c['id'] for c in n['choices']]
    check(len(choice_ids) == len(set(choice_ids)), f'{path}: duplicate choice')
    for c in n['conditions']:
        validate_condition(c, path)
    for c in n['choices']:
        cp = f'{path}/{c["id"]}'
        cmd, args = c['commandType'], c['args']
        check(cmd in commands and cmd in allowed_commands, f'{cp}: command not registered')
        if cmd in commands:
            needed, allowed = commands[cmd]
            check(needed.issubset(args) and set(args).issubset(allowed), f'{cp}: invalid payload keys')
        for v in c['conditions']:
            validate_condition(v, cp)
        if 'nextStoryletId' in c:
            check(c['nextStoryletId'] in node_ids, f'{cp}: dangling navigation')
        if cmd == 'Travel':
            check(args['toLocationId'] in locations, f'{cp}: invalid destination')
            check(not (n['locationId'] == 'LOC_GATE' and args['toLocationId'] == 'LOC_RUINS'), f'{cp}: bypasses expedition entry')
        if cmd == 'Talk' and args.get('topicId') == 'CLAIM_BEGINNER_MANUAL':
            check(args.get('claimId') == b['economy']['manualClaimKey'], f'{cp}: duplicate manual claim domain')
        if cmd == 'StartTraining':
            check(args['methodId'] in b['cultivation']['methods'], f'{cp}: unknown training method')
        if cmd == 'StartBreakthrough':
            check(args['targetRealmId'] in {'QI_1','FOUNDATION_1'} and type(args['usePill']) is bool, f'{cp}: invalid breakthrough payload')
for x in assets:
    check(x['status'] == 'planned' and x['filePath'] is None, f'{x["id"]}: must not claim unmade assets exist')
    check(bool(x['alt']), f'{x["id"]}: missing alt text')
for t in s['agreementTemplates']:
    check(set(t['participantIds']) == actors, f'{t["id"]}: agreement party mismatch')
    for key, value in walk(t):
        if key.endswith('ruleRef'):
            check(value in r['allowedRuleRefs'], f'{t["id"]}: unknown ruleRef')
            try: resolve(b, value)
            except KeyError: errors.append(f'{t["id"]}: missing rule value')
        if key.endswith('absentDropStatus'):
            check(value == 'not_triggered', 'absent loot must not be breach')

# Story selection is condition-driven; navigation links need not form one linear chain.
for end in ['STORY_MARKET_REUNION_FULFILLED','STORY_MARKET_REUNION_BREACHED']:
    n = next(x for x in nodes if x['id'] == end)
    check(any(x['kind']=='clock' and x['op']=='gte' and x['value']=={'ruleRef':'story.reunionWaitDays'} for x in n['conditions']), f'{end}: missing wait gate')
    check(any(x['kind']=='entity' and x['subjectId']=='NPC_LIN_WAN' and x['key']=='alive' and x['value'] is True for x in n['conditions']), f'{end}: dead NPC could appear')

tasks = (ROOT/'docs/TASKS.md').read_text(encoding='utf-8')
acceptance = (ROOT/'docs/ACCEPTANCE.md').read_text(encoding='utf-8')
task_ids = re.findall(r'^### (M\d+-\d+) ', tasks, re.M) + re.findall(r'^\| (M\d+-\d+)／planned', tasks, re.M)
ac_ids = re.findall(r'^\| (AC-\d+)／', acceptance, re.M)
check(len(task_ids) == len(set(task_ids)) == 34, 'expected 34 unique task definitions')
check(len(ac_ids) == len(set(ac_ids)) == 69, 'expected 69 unique acceptance definitions')
check(set(re.findall(r'AC-\d+', tasks)).issubset(set(ac_ids)), 'task references unknown acceptance')
check(set(re.findall(r'M\d+-\d+', tasks)).issubset(set(task_ids)), 'unknown task dependency/reference')
# Every listed row dependency must precede its task in milestone/task order.
order = lambda t: tuple(map(int, t[1:].split('-')))
for line in tasks.splitlines():
    m = re.match(r'^\| (M\d+-\d+)／planned \| ([^|]+)\|', line)
    if m:
        for dependency in re.findall(r'M\d+-\d+', m.group(2)):
            check(order(dependency) < order(m.group(1)), f'non-prior dependency: {m.group(1)} -> {dependency}')
for rel in ['README.md','AGENTS.md','START_WITH_CODEX.md','docs/GDD.md','docs/TDD.md','docs/COMMANDS.md','docs/UX_CONTENT.md','docs/TASKS.md','docs/ACCEPTANCE.md']:
    text = (ROOT/rel).read_text(encoding='utf-8')
    check('docs/BACKLOG.md' not in text, f'{rel}: stale backlog filename')
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if i and line.startswith('|') and lines[i-1].startswith('|'):
            check(line.count('|') == lines[i-1].count('|'), f'{rel}:{i+1}: table width mismatch')
report = {'status': 'PASS' if not errors else 'FAIL', 'checks': checks, 'storylets':len(nodes),'planned_assets':len(assets),'tasks':len(task_ids),'acceptance_cases':len(ac_ids),'errors':errors,'scope':'Static specification and sample consistency only; game tests not run.'}
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
