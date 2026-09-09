import images from "./content/image-display.json";
/** Presentation derivatives leave source asset IDs and historical content locks untouched. */
export function imageAsset(source: string) {
  const image = (images as unknown as Record<string, [string, number, number, boolean]>)[source];
  return image
    ? { src: image[0], width: image[1], height: image[2], lazy: image[3] }
    : { src: source, width: 1280, height: 720, lazy: true };
}
