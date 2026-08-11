import bcrypt from "bcryptjs";
import { env } from "./env";

export async function isCorrectPassword(candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, env.passwordHash);
}
