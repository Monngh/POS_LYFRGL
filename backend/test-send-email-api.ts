import dotenv from "dotenv";
dotenv.config();

import { Request, Response } from "express";
import { sendTicketByEmail } from "./src/controllers/ticketEmail.controller";

const mockResponse = () => {
  const res = {} as Response;
  res.status = (code: number) => {
    console.log("Response Status:", code);
    return res;
  };
  res.json = (data: any) => {
    console.log("Response JSON:", JSON.stringify(data, null, 2));
    return res;
  };
  return res;
};

async function main() {
  const req = {
    user: {
      userId: 5,
      branchId: 1,
      email: "juan.centro@fmb.com",
      role: "CAJERO"
    },
    body: {
      email: "gaelhernandezmonroy@gmail.com",
      subject: "Ticket de Compra V-123456",
      pdfBase64: "JVBERi0xLjQKJdPr6gogMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAyIDAgUiA+PiBlbmRvYmoKMiAwIG9iagogIDw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbIDMgMCBSIF0gL0NvdW50IDEgPj4gZW5kb2JqCjMgMCBvYmoKICA8PCAvVHlwZSAvUGFnZSAvUGFyZW50IDIgMCBSIC9NZWRpYUJveCBbIDAgMCA1OTUgODQyIF0gPj4gZW5kb2JqCnRyYWlsZXIKICA8PCAvU2l6ZSA0IC9Sb290IDEgMCBSID4+CiUlRU9G",
      pdfFilename: "ticket_V-123456.pdf"
    }
  } as unknown as Request;

  const res = mockResponse();
  await sendTicketByEmail(req, res);
}

main().catch(console.error);
