import content from "../../content-packs/cultivation-sects/sects.json";
import type { Actor, LocationId, SectId } from "./types";
type Resident = {
  id: string;
  name: string;
  sex: string;
  age: number;
  realm: number;
  aptitude: number;
  personality: string;
  background: string;
  interest: string;
  wish: string;
  partner?: string;
};
export const SECTS = content.sects as (Omit<
  (typeof content.sects)[number],
  "id" | "residents" | "home"
> & { id: SectId; home: LocationId; residents: Resident[] })[];
export const sectById = (id?: SectId) => SECTS.find((s) => s.id === id);
export const sectAt = (location: LocationId) => SECTS.find((s) => s.home === location);
export const sectResident = (id: string) =>
  SECTS.flatMap((s) => s.residents).find((a) => a.id === id);
export const sectHome = (a: Actor) =>
  sectById(a.sectMembership?.id)?.home as LocationId | undefined;
