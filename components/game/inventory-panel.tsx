"use client";
import { useState } from "react";
import { PagedContent } from "@/components/ui/paged-content";
import { SectionNav } from "@/components/ui/section-nav";
import { Button } from "@/components/ui/button";
import { ALL_SHOP_ITEMS } from "@/lib/game/economy";
import { B, stats } from "@/lib/game/rules";
import { inCave } from "@/lib/game/cultivation";
import { ARTIFACTS, REALMS } from "@/lib/game/content/official";
import { LOCATIONS, locationKind } from "@/lib/game/world-map";
import type { World } from "@/lib/game/types";
import type { Send } from "./panels";
export function InventoryPanel({
  world: w,
  send,
  busy,
}: {
  world: World;
  send: Send;
  busy: boolean;
}) {
  const [view, setView] = useState("items");
  const p = w.player,
    market = locationKind(p.location) === "market",
    inn = locationKind(p.location) === "inn";
  const blocked = busy || !!w.longAction || !!w.pendingDailyEventId || !!w.battle || w.ended;
  const artifact = ARTIFACTS.find((a) => a.id === w.profile.artifact)!;
  const next = B.cultivation.manualRanks[p.manualRank + 1];
  const upgradeReason = !p.manual
    ? "先领取入门功法"
    : !next
      ? "已达最高功法阶"
      : !inn
        ? "请到客栈办理"
        : p.realm < (next.minRealm ?? 0)
          ? `需达到${REALMS[next.minRealm ?? 0]}`
          : p.stones < next.cost
            ? `还缺 ${next.cost - p.stones} 灵石`
            : "";
  const cave = B.cultivation.cave;
  const caveReason = !market
    ? "请到坊市办理"
    : p.realm < cave.minRealm
      ? `需达到${REALMS[cave.minRealm]}`
      : p.cave === p.location
        ? "已在本城置办洞府"
        : p.stones < cave.cost
          ? `还缺 ${cave.cost - p.stones} 灵石`
          : "";
  const items = (Object.keys(ALL_SHOP_ITEMS) as (keyof typeof ALL_SHOP_ITEMS)[]).map((id) => ({
    id,
    ...ALL_SHOP_ITEMS[id],
    qty: p[id],
  }));
  return (
    <section className="panel-section screen-panel inventory-panel">
      <header className="section-heading">
        <h2 className="serif">查看随身物资</h2>
        <p>
          灵石 {p.stones} · 感悟 {p.insight}
        </p>
      </header>
      <SectionNav
        label="行囊分类"
        value={view}
        onChange={setView}
        items={[
          { id: "items", label: "随身物品" },
          { id: "practice", label: "法宝与修行" },
          { id: "shop", label: "坊市交易" },
        ]}
      />
      <PagedContent label="行囊" resetKey={view}>
        <h3 className="list-heading" hidden={view === "shop"}>
          {view === "items" ? "随身物品" : "法宝、功法与洞府"}
        </h3>
        <div className="inventory-grid">
          <article className="inventory-item" hidden={view !== "practice"}>
            <img
              className="item-icon artifact-art"
              src={`/artifacts/${artifact.id}.svg`}
              alt=""
              width={36}
              height={36}
            />
            <div>
              <h3>{artifact.name}</h3>
              <p>{artifact.description}</p>
            </div>
          </article>
          <article className="inventory-item" hidden={view !== "practice"}>
            <div>
              <h3>基础吐纳诀 · {p.manual ? `${p.manualRank} 阶` : "未习得"}</h3>
              <p>每日修为加成 +{B.cultivation.manualRanks[p.manualRank].gain}</p>
              {next && (
                <p>
                  进阶 {next.cost} 灵石 · 每日加成 +{next.gain}
                </p>
              )}
              <p>{upgradeReason}</p>
              <Button
                variant="outline"
                disabled={blocked || !!upgradeReason}
                onClick={() => void send({ type: "upgradeManual" })}
              >
                进阶功法
              </Button>
            </div>
          </article>
          <article className="inventory-item" hidden={view !== "practice"}>
            <div>
              <h3>查看洞府</h3>
              <p>
                {p.cave
                  ? `${LOCATIONS[p.cave].name} · ${inCave(p) ? "正在享有" : "返回本城可享"}每日 +${cave.dailyGain} 修为`
                  : "尚无洞府"}
              </p>
              <p>
                置办 {cave.cost} 灵石 · {caveReason}
              </p>
              <Button
                variant="outline"
                disabled={blocked || !!caveReason}
                onClick={() => void send({ type: "rentCave" })}
              >
                置办洞府
              </Button>
            </div>
          </article>
          {items
            .filter((i) => i.qty > 0)
            .map((item) => (
              <article className="inventory-item" key={item.id} hidden={view !== "items"}>
                <div>
                  <h3>
                    {item.name} × {item.qty}
                  </h3>
                  <p>{item.description}</p>
                  {item.id === "qi" && (
                    <Button
                      variant="outline"
                      disabled={blocked || !p.manual}
                      onClick={() => void send({ type: "use", item: "qi" })}
                    >
                      服用聚气丹
                    </Button>
                  )}
                  {item.id === "healing" && (
                    <Button
                      variant="outline"
                      disabled={blocked || p.hp >= stats(p).maxHp}
                      onClick={() => void send({ type: "heal" })}
                    >
                      服用一枚
                    </Button>
                  )}
                </div>
              </article>
            ))}
        </div>
        {view === "items" && !items.some((item) => item.qty > 0) && (
          <p className="empty-copy">行囊暂空，可到坊市采买，或在游历中收集物资。</p>
        )}
        <section className="inventory-market" hidden={view !== "shop"}>
          <h3 className="list-heading">坊市采买与出售{!market && " · 请先抵达坊市"}</h3>
          <div className="shop-list">
            {items.map((item) => (
              <div className="shop-row" key={item.id}>
                <div>
                  <strong>
                    {item.name} · 已有 {item.qty}
                  </strong>
                  <small data-shop-item={item.id} data-price={item.price}>
                    {item.price} 灵石／份
                  </small>
                  {!market ? (
                    <small>需到坊市购买</small>
                  ) : (
                    p.stones < item.price && <small>还缺 {item.price - p.stones} 灵石</small>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={blocked || !market || p.stones < item.price}
                  onClick={() => void send({ type: "buy", item: item.id })}
                >
                  购买{item.name}
                </Button>
                {item.id !== "qi" && (
                  <Button
                    variant="outline"
                    size="sm"
                    data-sell-item={item.id}
                    data-price={B.economy.sellPrices[item.id]}
                    disabled={blocked || !market || item.qty < 1}
                    onClick={() =>
                      void send({
                        type: "sell",
                        item: item.id as "healing" | "pills" | "grass",
                        quantity: 1,
                      })
                    }
                  >
                    出售{item.name} · {B.economy.sellPrices[item.id]} 灵石
                  </Button>
                )}
              </div>
            ))}
          </div>

          <p>
            {!market
              ? "来到坊市后可兑换突破丹。"
              : `需 ${B.economy.pillExchange.inputQuantity} 株凝元草与 ${B.economy.pillExchange.spiritStoneCost} 灵石。`}
          </p>
          <Button
            className="exchange-button"
            variant="ghost"
            disabled={
              blocked ||
              !market ||
              p.grass < B.economy.pillExchange.inputQuantity ||
              p.stones < B.economy.pillExchange.spiritStoneCost
            }
            onClick={() => void send({ type: "exchange" })}
          >
            兑换突破丹 · {B.economy.pillExchange.spiritStoneCost} 灵石
          </Button>
        </section>
      </PagedContent>
    </section>
  );
}
