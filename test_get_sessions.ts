import { getActiveSessions } from "./backend/src/controllers/securityAudit.controller";
import * as sr from "./backend/src/utils/sessionRegistry";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (admin) {
    sr.openSession(admin.id, { ip: "127.0.0.1" });
    const req = {} as any;
    const res = {
      json: (data: any) => console.log(JSON.stringify(data, null, 2)),
      status: () => res
    } as any;
    await getActiveSessions(req, res);
  }
}
run();
