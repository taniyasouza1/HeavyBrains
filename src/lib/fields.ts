export type Shape = "sphere" | "cube" | "cylinder" | "bars" | "dodeca" | "phone";

export interface ModelCredit { title: string; author: string; url: string }

export interface Field {
  slug: string;
  name: string;
  /** Headline is split so one phrase can carry the accent colour. */
  headline: [string, string, string];
  sub: string;
  /** Example brief; every one is run through the real extractor on the page. */
  brief: string;
  shape: Shape;
  /** Hero model in /public/models. The procedural `shape` shows while it loads. */
  model: string;
  /** Euler rotation (radians) to stand a model upright when its file is authored lying down. */
  modelRotation?: [number, number, number];
  credit: ModelCredit;
}

export const GENERAL: Field = {
  slug: "all",
  name: "Any engineering role",
  headline: ["Find the ", "talent", " your usual search misses"],
  sub: "Describe the role. We rank people from profile evidence, then show who sits outside the companies you usually search.",
  brief: "I need a senior backend engineer for a high-throughput payments platform. They should have experience with distributed systems, database performance and reliability. Java or Go is useful, but the systems they've worked on matter more than the company name.",
  shape: "sphere",
  model: "/models/all.glb",
  credit: { title: "Human Brain", author: "3DRT STUDIOS", url: "https://sketchfab.com/3d-models/human-brain-7a27c17fd6c0488bb31ab093236a47fb" },
};

export const FIELDS: Field[] = [
  {
    slug: "backend", model: "/models/backend.glb", credit: { title: "Server Rack", author: "Spellkaze", url: "https://sketchfab.com/3d-models/server-rack-62f6779cb7e448b19aaf58544c3c7218" }, name: "Backend", shape: "cube",
    headline: ["Find the ", "backend engineers", " your usual search misses"],
    sub: "Distributed systems, databases and payments work, read from what people have actually shipped.",
    brief: GENERAL.brief,
  },
  {
    slug: "platform", model: "/models/platform.glb", credit: { title: "Shipping containers", author: "SpatialNeglect", url: "https://sketchfab.com/3d-models/shipping-containers-cc3f7136710f4905905eae1d10ac50b7" }, name: "Platform & reliability", shape: "cylinder",
    headline: ["Find the ", "platform engineers", " your usual search misses"],
    sub: "Kubernetes, observability and on-call experience, with the evidence quoted next to every score.",
    brief: "I need a staff platform engineer to run our internal developer platform. They must have worked on Kubernetes, observability and reliability at scale. Go is a plus.",
  },
  {
    slug: "data-ml", model: "/models/data-ml.glb", credit: { title: "Nvidia GeForce RTX 5070 - MSI Gaming X Trio", author: "Darky Vip 3D", url: "https://sketchfab.com/3d-models/nvidia-geforce-rtx-5070-msi-gaming-x-trio-26fbe59aa2ab4a749ef71583aefdadd5" }, name: "Data & machine learning", shape: "bars",
    headline: ["Find the ", "machine learning engineers", " your usual search misses"],
    sub: "Data pipelines, low-latency inference and Python, matched on work evidence instead of job titles.",
    brief: "I need a senior machine learning engineer who has built data pipelines and low-latency inference services. Python is required. Kubernetes is useful.",
  },
  {
    slug: "security", model: "/models/security.glb", credit: { title: "Padlock & Key", author: "tediuminteractive", url: "https://sketchfab.com/3d-models/padlock-key-745c1c723d26498e9681cc0d7d065b3c" }, name: "Security", shape: "dodeca",
    headline: ["Find the ", "security engineers", " your usual search misses"],
    sub: "Fintech and infrastructure security backgrounds, including people outside the usual security shortlist.",
    brief: "I need a senior security engineer in fintech. They should have worked on payments, reliability and observability. Python or Go is a plus.",
  },
  {
    slug: "mobile", model: "/models/mobile.glb", modelRotation: [Math.PI / 4, 0, 0], credit: { title: "Low Poly Mobile Phone", author: "kimmy.k", url: "https://sketchfab.com/3d-models/low-poly-mobile-phone-4ff99cf17b164e7b9790638c5d2ef4ce" }, name: "Mobile", shape: "phone",
    headline: ["Find the ", "mobile engineers", " your usual search misses"],
    sub: "Payments apps, API work and latency-sensitive experience, ranked on what is supported by their profiles.",
    brief: "I need a senior mobile engineer for a payments app. They must have experience with APIs, low latency and reliability. Observability is nice to have.",
  },
];

export const CREDITS = [GENERAL, ...FIELDS].map((f) => f.credit);

export const getField = (slug: string) => FIELDS.find((f) => f.slug === slug);
