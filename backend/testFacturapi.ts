import Facturapi from 'facturapi';

const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  console.log("BODY:", options.body);
  return new Response('{}');
};

const f = new Facturapi("sk_test_w3l9pQWnjL7y428d0v8N3Z3Y0l7nOQoN");

async function test() {
  await f.invoices.create({
    type: "E",
    customer: "test",
    items: [],
    related_documents: [
      {
        relationship: "01",
        document: "58e8062b88523b469ec18d3f"
      }
    ]
  } as any);
}
test();
