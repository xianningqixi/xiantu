"use client";
import { useState } from "react";
import { Map, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LOCATIONS } from "@/lib/game/world-map";
import type { World } from "@/lib/game/types";
import { AtlasMap } from "./atlas-map";
import type { Send } from "./panels";

export function AtlasDialog({
  world,
  send,
  blocked,
}: {
  world: World;
  send: Send;
  blocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setError("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="map-open-button">
          <Map data-icon="inline-start" />
          地图
        </Button>
      </DialogTrigger>
      <DialogContent className="atlas-dialog" showCloseButton={false}>
        <div className="atlas-dialog-heading">
          <DialogHeader>
            <DialogTitle className="serif">云岚境大地图</DialogTitle>
            <DialogDescription>
              第 {world.day + 1} 日 · 当前在{LOCATIONS[world.player.location].name}
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button size="icon" variant="ghost" aria-label="关闭地图">
              <X />
            </Button>
          </DialogClose>
        </div>
        <div className="atlas-dialog-body">
          <AtlasMap
            key={world.player.location}
            world={world}
            blocked={blocked}
            send={async (command) => {
              setError("");
              const saved = await send(command);
              if (saved) setOpen(false);
              else setError("启程未完成，请检查当前行动状态后重试。");
              return saved;
            }}
          />
          {error && (
            <p className="portrait-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
