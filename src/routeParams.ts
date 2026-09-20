/**
 * The one value a route parameter actually is.
 *
 * expo-router types a dynamic segment as `string | string[] | undefined`:
 * repeated in the URL it is an array, and on a cold deep link it can be
 * missing. Screens declared theirs as `{ id: string }`, which typechecked and
 * then handed an array to a lookup that matched nothing — surfacing as the
 * screen's own "not found", indistinguishable from a record that really has
 * gone.
 *
 * Empty for "no usable value", which every caller already handles: it is what
 * a lookup for a record that is not there returns.
 */
export function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}
