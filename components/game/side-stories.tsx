"use client";
import {extensionScenes} from '@/lib/game/content-story';
import {extensionVisual} from '@/lib/game/content/extensions';
import type {Command,World} from '@/lib/game/types';
import {GameImage} from './panels';
export function SideStories({world,busy,send}:{world:World;busy:boolean;send:(command:Command)=>Promise<boolean>}){
 const scenes=extensionScenes(world);if(!scenes.length)return null;
 return <section className="side-stories" aria-label="坊间故事">{scenes.map(scene=>{const art=extensionVisual(scene.visualId);return <article className="side-story" key={scene.id}><figure><GameImage src={art.url} alt={art.alt}/></figure><div><span className="eyebrow">{scene.eyebrow}</span><h2 className="serif">{scene.title}</h2><p>{scene.body}</p>{scene.quote&&<blockquote>{scene.quote}</blockquote>}<div>{scene.choices.map((c,i)=><button className="story-choice" key={c.id} disabled={busy} onClick={()=>void send({type:'chooseExtension',nodeId:scene.id,choiceId:c.id})}><span className="choice-number">{String(i+1).padStart(2,'0')}</span><span><strong>{c.label}</strong><small>{c.hint}</small></span></button>)}</div></div></article>})}</section>;
}
