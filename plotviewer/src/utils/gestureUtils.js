export const getTouchDistance = (touchA, touchB) => {
  const dx = touchB.clientX - touchA.clientX;
  const dy = touchB.clientY - touchA.clientY;
  return Math.hypot(dx, dy);
};

export const getTouchAngle = (touchA, touchB) => {
  const dx = touchB.clientX - touchA.clientX;
  const dy = touchB.clientY - touchA.clientY;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};

export const getTouchCenter = (touchA, touchB) => ({
  x: (touchA.clientX + touchB.clientX) / 2,
  y: (touchA.clientY + touchB.clientY) / 2,
});

export const normalizeAngle = (value) => {
  let nextValue = value % 360;

  if (nextValue < 0) {
    nextValue += 360;
  }

  return nextValue;
};

export const normalizeAngleDelta = (value) => {
  let nextValue = value;

  while (nextValue > 180) {
    nextValue -= 360;
  }

  while (nextValue < -180) {
    nextValue += 360;
  }

  return nextValue;
};
