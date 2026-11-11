import { cookies } from "next/headers";

export const COLOR_SCHEME_COOKIE = "noshowhq_color_scheme";

export type ColorSchemeChoice = "LIGHT" | "DARK";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
};

export function isColorSchemeChoice(value: unknown): value is ColorSchemeChoice {
  return value === "LIGHT" || value === "DARK";
}

export async function readColorScheme(): Promise<"light" | "dark"> {
  const jar = await cookies();
  return jar.get(COLOR_SCHEME_COOKIE)?.value === "dark" ? "dark" : "light";
}

export async function writeColorScheme(choice: ColorSchemeChoice): Promise<void> {
  const jar = await cookies();
  jar.set(COLOR_SCHEME_COOKIE, choice === "DARK" ? "dark" : "light", cookieOptions);
}

export async function clearColorScheme(): Promise<void> {
  const jar = await cookies();
  jar.delete(COLOR_SCHEME_COOKIE);
}
