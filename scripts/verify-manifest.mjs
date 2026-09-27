let input = "";
for await (const chunk of process.stdin) input += chunk;

const manifest = JSON.parse(input);
const platforms = new Set(
  (manifest.manifests || []).map(({ platform }) => `${platform?.os}/${platform?.architecture}`),
);

for (const required of ["linux/amd64", "linux/arm64"]) {
  if (!platforms.has(required)) {
    throw new Error(`multi-arch manifest is missing ${required}`);
  }
}

console.log("verified manifest platforms: linux/amd64, linux/arm64");
