import { revokeSessionForcefully, getActiveSession } from "./src/utils/sessionRegistry";
import crypto from "crypto";

// Mock adding a session
const userId = 2;
const mockJti = crypto.randomUUID();
// Add session (requires accessing the module)
import * as sr from "./src/utils/sessionRegistry";
sr.openSession(userId, { ip: "127.0.0.1", device: "test" });
console.log("Before:", sr.getActiveSession(userId));
sr.revokeSessionForcefully(userId);
console.log("After:", sr.getActiveSession(userId));
