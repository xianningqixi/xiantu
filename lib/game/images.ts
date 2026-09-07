import images from "./content/images.json";
/** Presentation derivatives leave source asset IDs and historical content locks untouched. */
export function imageAsset(source: string) {
  return (
    (images as Record<string, { src: string; width: number; height: number; lazy: boolean }>)[
      source
    ] ?? { src: source, width: 1280, height: 720, lazy: true }
  );
}
