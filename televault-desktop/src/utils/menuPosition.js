const MENU_WIDTH = 220;
const MENU_ITEM_HEIGHT = 40;
const MENU_SEPARATOR_HEIGHT = 9;
const MENU_PADDING = 8;
const VIEWPORT_PADDING = 8;

export function estimateMenuHeight(items) {
  let height = MENU_PADDING;
  for (const item of items) {
    if (item.separator) height += MENU_SEPARATOR_HEIGHT;
    else height += MENU_ITEM_HEIGHT;
  }
  return height;
}

export function getMenuPosition({ items, anchor, x, y }) {
  const menuWidth = MENU_WIDTH;
  const menuHeight = estimateMenuHeight(items);
  const maxX = window.innerWidth - menuWidth - VIEWPORT_PADDING;
  const maxY = window.innerHeight - menuHeight - VIEWPORT_PADDING;

  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    let left = rect.right - menuWidth;
    let top = rect.bottom + 4;

    if (top > maxY) {
      top = rect.top - menuHeight - 4;
    }

    left = Math.max(VIEWPORT_PADDING, Math.min(left, maxX));
    top = Math.max(VIEWPORT_PADDING, Math.min(top, maxY));
    return { x: left, y: top };
  }

  let left = x;
  let top = y;

  if (left > maxX) left = maxX;
  if (top > maxY) top = maxY;
  left = Math.max(VIEWPORT_PADDING, left);
  top = Math.max(VIEWPORT_PADDING, top);

  return { x: left, y: top };
}
