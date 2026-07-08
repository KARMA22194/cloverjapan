import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Ergänzt Session/JWT um unsere Zusatzfelder (id, role).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
