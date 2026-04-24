export function buildLinePath(
  values: number[],
  width: number,
  height: number,
  paddingX: number,
  paddingY: number
) {
  if (!values.length) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;

  return values
    .map((value, index) => {
      const x = paddingX + (innerWidth * index) / Math.max(values.length - 1, 1);
      const normalized = max === min ? 0.5 : (value - min) / (max - min);
      const y = height - paddingY - normalized * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function buildAreaPath(
  values: number[],
  width: number,
  height: number,
  paddingX: number,
  paddingY: number
) {
  if (!values.length) return "";
  const line = buildLinePath(values, width, height, paddingX, paddingY);
  const lastX = width - paddingX;
  const baseline = height - paddingY;
  return `${line} L ${lastX} ${baseline} L ${paddingX} ${baseline} Z`;
}
