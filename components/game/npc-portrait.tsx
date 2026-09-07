"use client";
import { useState } from 'react';
import { npcPortrait } from '@/lib/game/npc-profile';
import type { Actor, World } from '@/lib/game/types';

export function NpcPortrait({world,actor,className=''}:{world:World;actor:Actor;className?:string}){
  const portrait=npcPortrait(world,actor);const [failed,setFailed]=useState<string|null>(null);
  return <div className={`npc-portrait ${portrait.slot===null?'single-portrait':''} ${className}`} role="img" aria-label={`${actor.name}的立绘`}>
    {failed===portrait.src?<span className="serif">{actor.name[0]}</span>:<img src={portrait.src} alt="" loading="lazy" onError={()=>setFailed(portrait.src)} style={portrait.slot===null?undefined:{width:'300%',height:'300%',maxWidth:'none',left:`-${portrait.slot%3*100}%`,top:`-${Math.floor(portrait.slot/3)*100}%`}}/>}
  </div>;
}
