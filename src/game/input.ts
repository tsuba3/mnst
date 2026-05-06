export type AimState = {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

export type InputCallbacks = {
  onAimStart: (x: number, y: number) => boolean; // 受理されたか
  onAimMove: (x: number, y: number) => void;
  onAimEnd: (x: number, y: number) => void;
  onAimCancel: () => void;
};

export function attachPointerInput(
  canvas: HTMLCanvasElement,
  cb: InputCallbacks,
): () => void {
  let activePointerId: number | null = null;

  function toLocal(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    };
  }

  const down = (e: PointerEvent) => {
    if (activePointerId !== null) return;
    const { x, y } = toLocal(e);
    if (!cb.onAimStart(x, y)) return;
    activePointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const move = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    const { x, y } = toLocal(e);
    cb.onAimMove(x, y);
    e.preventDefault();
  };

  const up = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    const { x, y } = toLocal(e);
    activePointerId = null;
    cb.onAimEnd(x, y);
    e.preventDefault();
  };

  const cancel = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    cb.onAimCancel();
  };

  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);

  return () => {
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", cancel);
  };
}
