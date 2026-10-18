/** Pixel rectangles shared by the timeline walker and the word-arcade runner. */
export const WALKER_BODY = [
  // x, y, width, height; drawn in this order after the 27x32 transform of each owner.
  [0, 0, 8, 24],
  [12, 0, 8, 8],
  [7, 4, 16, 4],
  [12, 4, 4, 12],
  [20, 4, 4, 12],
  [7, 12, 20, 4],
  [4, 15, 19, 13],
  [8, 15, 4, 13],
  [16, 20, 4, 8],
] as const;

/** Two walk frames; each frame's pair is drawn in listed order. */
export const WALKER_FEET = [
  [
    [8, 28, 4, 4],
    [16, 28, 4, 4],
  ],
  [
    [10, 28, 4, 4],
    [14, 28, 4, 4],
  ],
] as const;
