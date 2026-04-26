import fs from "node:fs/promises";
import path from "node:path";

const MODELS = [
  {
    src: "Reonic Data/Exp 3D-Modells/3D_Modell Brandenburg.glb",
    dest: "public/models/brandenburg.glb",
  },
  {
    src: "Reonic Data/Exp 3D-Modells/3D_Modell Hamburg.glb",
    dest: "public/models/hamburg.glb",
  },
  {
    src: "Reonic Data/Exp 3D-Modells/3D_Modell North Germany.glb",
    dest: "public/models/north_germany.glb",
  },
  {
    src: "Reonic Data/Exp 3D-Modells/3D_Modell Ruhr.glb",
    dest: "public/models/ruhr.glb",
  },
];

async function main() {
  for (const model of MODELS) {
    const src = path.resolve(model.src);
    const dest = path.resolve(model.dest);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    console.log(`synced ${model.dest}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
