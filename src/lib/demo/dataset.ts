import type { Candidate, Company, Employment } from "@/types";
import { slug } from "@/lib/utils/text";

/**
 * FICTIONAL demo data. Every company and person below is invented; profile URLs use the reserved example.com
 * domain. Scenario: a payments company hiring a senior backend engineer for high-throughput services,
 * database performance and distributed infrastructure.
 */
export const DEMO_SNAPSHOT = "2026-09-01T00:00:00Z";
export const DEMO_USUAL_COMPANIES = ["Northwind Pay", "Halcyon Bank", "Meridian Cloud"];

const co = (name: string, industry: string, location: string, headcount: number, description: string): Company => ({
  id: `demo-co-${slug(name)}`, name, industry, location, headcount, description, source: "demo",
  website: `https://example.com/demo-company/${slug(name)}`,
});

export const DEMO_COMPANIES: Company[] = [
  co("Northwind Pay", "Financial Services", "London, UK", 900, "Card acquiring and merchant payments platform. (Fictional demo company.)"),
  co("Halcyon Bank", "Banking", "Dublin, Ireland", 4200, "Retail and business bank with an in-house engineering organisation. (Fictional demo company.)"),
  co("Meridian Cloud", "Software Development", "Amsterdam, Netherlands", 2600, "Managed cloud databases and infrastructure services. (Fictional demo company.)"),
  co("Tessera Logistics", "Logistics", "Rotterdam, Netherlands", 1300, "Freight routing and shipment tracking software. (Fictional demo company.)"),
  co("Quillfeather Games", "Computer Games", "Stockholm, Sweden", 700, "Multiplayer online games studio. (Fictional demo company.)"),
  co("Lumen Ledger", "Financial Services", "Berlin, Germany", 150, "Accounting ledger software for small businesses. (Fictional demo company.)"),
  co("Brightloom Health", "Hospitals and Health Care", "Manchester, UK", 500, "Clinic scheduling and patient records software. (Fictional demo company.)"),
  co("Pinecrest Telecom", "Telecommunications", "Oslo, Norway", 3100, "Mobile network operator with in-house platform teams. (Fictional demo company.)"),
  co("Orbital Freight Systems", "Transportation", "Hamburg, Germany", 800, "Cargo operations software. (Fictional demo company.)"),
  co("Vantage Ads", "Advertising Services", "Barcelona, Spain", 1100, "Programmatic advertising exchange. (Fictional demo company.)"),
];

type Job = [company: string, title: string, start: string, end: string | null, description?: string];

const person = (
  n: number, name: string, location: string, headline: string, jobs: Job[], skills: string[] = [], summary?: string,
): Candidate => {
  const employment: Employment[] = jobs.map(([company, title, start, end, description]) => ({
    company, title, startDate: start, endDate: end ?? undefined, description, current: end === null,
    companyId: `demo-co-${slug(company)}`,
  }));
  const s = slug(name);
  return {
    id: `demo-${String(n).padStart(2, "0")}`, name, location, headline, summary, skills, employment,
    title: employment.find((e) => e.current)?.title,
    profileUrl: `https://example.com/demo-profile/${s}`,
    sourceTimestamp: DEMO_SNAPSHOT, source: "demo",
  };
};

export const DEMO_CANDIDATES: Candidate[] = [
  person(1, "Mara Ellison", "London, UK", "Senior Backend Engineer", [
    ["Northwind Pay", "Senior Backend Engineer", "2021-03", null,
      "Led the authorisation service rewrite in Java, sustaining 40,000 transactions per second at peak. Tuned Postgres indexing and replication to cut p99 query latency. Owned on-call and incident reviews for the ledger cluster."],
    ["Halcyon Bank", "Backend Engineer", "2017-06", "2021-02", "Built event-driven payment settlement services using Kafka with multi-region failover."],
  ], ["Java", "PostgreSQL", "Kafka"]),
  person(2, "Devon Okafor", "London, UK", "Backend Engineer | Distributed Systems | Kubernetes | Java | Go", [
    ["Northwind Pay", "Backend Engineer", "2022-01", null, "Built REST endpoints and admin tooling for the merchant onboarding team."],
    ["Quillfeather Games", "Junior Developer", "2020-02", "2021-12", "Maintained internal web tools."],
  ], ["Distributed Systems", "Kubernetes", "Java", "Go", "High Throughput", "Microservices"]),
  person(3, "Priya Ramanathan", "Dublin, Ireland", "Staff Engineer, payments reliability", [
    ["Halcyon Bank", "Staff Engineer", "2019-09", null,
      "Defined SLOs and ran on-call for the payments gateway, improving availability and fault tolerance through chaos engineering exercises. Java services on Kubernetes."],
    ["Brightloom Health", "Senior Backend Engineer", "2015-04", "2019-08", "Backend services for scheduling in Java."],
  ], ["Java", "Kubernetes", "Observability"]),
  person(4, "Tomas Brandt", "Amsterdam, Netherlands", "Senior Backend Engineer at Meridian Cloud", [
    ["Meridian Cloud", "Senior Backend Engineer", "2020-05", null,
      "Built a distributed control plane in Go using consensus-based coordination and sharding across regions. Processed millions of requests per day through Kafka-backed workflows."],
  ], ["Go", "Kafka", "Distributed Systems"]),
  person(5, "Hana Kobayashi", "Dublin, Ireland", "Senior Software Engineer", [
    ["Halcyon Bank", "Senior Software Engineer", "2018-02", null],
  ], []),
  person(6, "Isla Fernandes", "Rotterdam, Netherlands", "Senior Backend Engineer", [
    ["Tessera Logistics", "Senior Backend Engineer", "2020-10", null,
      "Designed the shipment-event pipeline handling 120,000 events per second on Kafka, with sharded Cassandra storage. Tuned partitioning and compaction to cut read latency, bringing p99 of tracking lookups from 900 ms to 80 ms. Written in Go."],
    ["Pinecrest Telecom", "Backend Engineer", "2016-09", "2020-09", "Operated high-availability signalling services; part of the on-call rotation."],
  ], ["Go", "Kafka", "Cassandra"]),
  person(7, "Rahul Venkatesan", "Stockholm, Sweden", "Staff Engineer, game services", [
    ["Quillfeather Games", "Staff Engineer", "2018-08", null,
      "Built low-latency matchmaking and session services serving peak traffic of several hundred thousand concurrent players. Redesigned database sharding and Redis caching to remove hot partitions and improve query performance."],
  ], ["Go", "Redis", "Distributed Systems"]),
  person(8, "Sofia Marchetti", "Berlin, Germany", "Senior Backend Engineer, fintech", [
    ["Lumen Ledger", "Senior Backend Engineer", "2019-11", null,
      "Owns the double-entry ledger service for payments reconciliation. Tuned PostgreSQL queries and replication; introduced partitioning for large ledger tables."],
  ], ["Java", "PostgreSQL"]),
  person(9, "Jonas Weber", "Manchester, UK", "Backend Developer", [
    ["Brightloom Health", "Backend Developer", "2021-07", null, "Developed appointment reminders in Python and Django for clinic customers."],
  ], ["Python", "Django"]),
  person(10, "Amara Nwosu", "Oslo, Norway", "Senior Backend Engineer, network platform", [
    ["Pinecrest Telecom", "Senior Backend Engineer", "2018-03", null,
      "Runs a distributed signalling platform targeting 99.99% availability; leads incident response and on-call. Services written in Go."],
  ], ["Go", "Erlang"]),
  person(11, "Leo Chen", "Hamburg, Germany", "Senior Backend Engineer | Distributed Systems | High Throughput | Kubernetes | Java | Go", [
    ["Orbital Freight Systems", "Senior Backend Engineer", "2019-01", null, "Maintained internal reporting tools and scheduled batch jobs."],
  ], ["Distributed Systems", "Kubernetes", "Java", "Go", "High Throughput", "Low Latency"]),
  person(12, "Ingrid Solheim", "Amsterdam, Netherlands", "Principal Engineer, storage", [
    ["Meridian Cloud", "Principal Engineer", "2017-01", null,
      "Leads the storage engine team for a managed distributed database: replication, index tuning and query optimisation for high-throughput customer workloads. Maintains availability SLAs."],
  ], ["C++", "Rust"]),
  person(13, "Marcus Doyle", "London, UK", "Frontend Engineer", [
    ["Northwind Pay", "Frontend Engineer", "2020-03", null, "Built the merchant dashboard in React."],
  ], ["React", "TypeScript"]),
  person(14, "Cole Bishop", "Barcelona, Spain", "Senior Backend Engineer", [
    ["Vantage Ads", "Senior Backend Engineer", "2018-05", null,
      "Built bidding services answering 300,000 requests per second with p99 latency under 10 ms. Improved MySQL query performance and Aerospike read latency for high-throughput workloads."],
  ], ["Java", "Go"]),
  person(15, "Nadia Haddad", "Rotterdam, Netherlands", "Backend Engineer", [
    ["Tessera Logistics", "Backend Engineer", "2022-06", null, "Optimised slow SQL queries and added indexes for the shipment search service in MySQL."],
    ["Halcyon Bank", "Software Engineer", "2019-01", "2022-05", "Worked on internal banking APIs in Java."],
  ], ["Java", "MySQL"]),
  person(16, "Oliver Grant", "Manchester, UK", "Senior Backend Engineer", [
    ["Brightloom Health", "Senior Backend Engineer", "2016-02", null,
      "Improved database performance for the patient-records service, including index tuning and read replicas. Improved reliability with on-call practice and incident reviews. Java."],
  ], ["Java", "PostgreSQL"]),
];

export const DEMO_ROLE_TEXT =
  "I need a senior backend engineer who has worked on distributed systems, database performance, and high-throughput services. Experience with Java or Go is useful, but I care more about the systems they've worked on than the company name on their resume.";
