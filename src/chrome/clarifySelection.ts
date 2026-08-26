/** App chrome: ClarifyPanel can complete a deictic ask from the live board selection. */

export function canUseSelection(selection: string[]): boolean {
  return selection.length >= 1;
}
