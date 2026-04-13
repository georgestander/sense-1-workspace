export default async function smoke({ window }) {
  const root = window.locator("#root");
  await root.waitFor({ state: "attached", timeout: 10_000 });

  const viewport = await window.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  console.log(
    JSON.stringify({
      smoke: "ok",
      viewport,
    }),
  );
}
