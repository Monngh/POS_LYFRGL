import { Preference, MercadoPagoConfig } from 'mercadopago';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
console.log("Token:", token ? token.substring(0, 15) + "..." : "undefined");
console.log("Sandbox:", process.env.MERCADOPAGO_SANDBOX);

if (!token) {
  console.error("No token configured.");
  process.exit(1);
}

const client = new MercadoPagoConfig({ accessToken: token });
const preference = new Preference(client);

async function run() {
  try {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const result = await preference.create({
      body: {
        items: [
          {
            id: "TEST1234",
            title: "Test Venta POS",
            quantity: 1,
            unit_price: 10,
            currency_id: "MXN",
          },
        ],
        external_reference: "TEST1234",
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: expiresAt,
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }],
          installments: 1,
        },
      },
    });

    console.log("Preference Created Successfully!");
    console.log("ID:", result.id);
    console.log("init_point:", result.init_point);
    console.log("sandbox_init_point:", result.sandbox_init_point);
  } catch (error) {
    console.error("Error creating preference:", error);
  }
}

run();
