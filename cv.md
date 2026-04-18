# Nikhil Kumar

**Email:** nikhil.kumar707128@gmail.com | **Phone:** 9523120037  
**LinkedIn:** linkedin.com/in/nikhill-kumarr | **GitHub:** github.com/khyaalnix  
**Location:** Bangalore, India

---

## Technical Skills

| Area | Skills |
|------|--------|
| **Languages** | Python, SQL, PySpark, PyFlink, JavaScript |
| **Big Data & Streaming** | Apache Spark, Apache Flink, Apache Airflow, Kafka, AirByte |
| **AI/ML Systems** | Google AI SDK, LangGraph, Agentic RAG, LoRA Finetuning, XGBoost, LightGBM |
| **Cloud & Infrastructure** | GCP (BigQuery, GKE, GCS), AWS (S3, Athena, EKS), Terraform, ArgoCD, Docker |
| **Databases & Vector Engines** | BigQuery, Athena, Redshift, MongoDB, Redis, DuckDB, Qdrant, Milvus |
| **Expertise** | Agentic AI, Distributed Systems, Realtime Analytics, Data Modelling, MLOps |

---

## Experience

### Khyaal — Senior Data Engineer & Founding Team
**June 2024 – Present | Bangalore, India**

Architected "Pulse," a unified event-driven CDP and AI Agent ecosystem processing PB-scale data for 1M+ users.

**Platform Architecture & Data Engineering**
- Architected metadata-driven Data Platform using Airflow, PySpark & BigQuery; replaced Mixpanel & saved INR 3.5M ($42K) annually.
- Engineered a fault-tolerant Kafka consumer processing 10M+ daily events with automated schema evolution & field collision detection, preventing 67 production schema breaks with <10s recovery.
- Built multi-cloud Kubernetes infrastructure across AWS EKS & GCP GKE via Terraform with 3-AZ high availability & 98% platform uptime.
- Led AWS S3→GCP GCS migration for high-volume data with zero downtime, achieving 40% cost reduction and 5x query performance improvement.
- Created data quality frameworks with DBT-style tests across 50+ tables, reducing data incidents by 60%; built Grafana dashboards for SLA-based alerting.

**Realtime Streaming & Event Processing**
- Designed real-time journey orchestration engine via PyFlink + Kafka processing 100K events/day with exactly-once semantics and <80ms p99 latency.
- Built DAG-based execution model with Redis state management for complex multi-step user journeys (Action, Wait, Condition nodes).
- Deployed multi-partition Kafka cluster with producer batching and consumer groups, sustaining 5K+ events/second with 96% delivery guarantees.
- Implemented custom Flink operators for segment/cohort evaluation and multi-channel action execution (Push, Email, SMS, WhatsApp).
- 3M+ journey executions/month, 35% improvement in user activation, <2s end-to-end event latency.

**AI/ML Systems & Agent Orchestration**
- Architected distributed agent orchestration framework using Airflow + Kafka + ephemeral Kubernetes pods, reducing operational overhead by 70%+.
- Scaled from 10 to 50+ concurrent agents processing 5K+ AI tasks/day with auto-recovery and dynamic scaling.
- Designed production RAG framework (khyaal-rag-core) with pluggable retrieval, routing, and evaluation components leveraging LangGraph and Qdrant stacks.
- Built a realtime AI Voice sales engine (Gemini Live API) for bidirectional streaming in 5+ Indic languages; achieved 78% accuracy improvement, <80ms p95 latency & Redis-backed session recovery for 20-min autonomous calls.
- Architected Kafka-based call orchestration framework processing 1K+ tasks/day with multi-tier retries & Redis semaphores; delivered 500+ qualified leads/week at 68% lower cost.

**Technical Leadership**
- Founded and scaled data engineering team from 0→3 engineers, establishing hiring, onboarding, and mentorship processes.
- Established engineering best practices: code reviews (95% coverage), CI/CD pipelines, documentation standards, incident playbooks.
- Zero critical production incidents in 6 months, 99% platform uptime, 380+ commits across projects.

---

### MadStreetDen (Vue.ai) — Machine Learning Engineer
**Jun 2023 – May 2024 | Chennai, India**

Delivered enterprise-grade ML for high-valuation financial and logistics clients.

- Developed high-precision OTS (One-Time Settlement) engine for an INR 20Bn+ NBFC using an 808-feature ensemble (Bureau, Static, Transactional); achieved a 30% YoY collection increase and $10M revenue uplift.
- Engineered temporal features using interval-based windowing and log-normalized transformations, improving model accuracy to 0.131 RMSE.
- Reduced fraud claims by 42% for $250M+ logistics client via ML pipelines analyzing 20M+ records using XGBoost/LightGBM ensembles.
- Created reusable AutoML SDK with automated feature selection, hyperparameter tuning & model explainability; later embedded in the core workflow of Vue.ai.
- Built AWS ETL pipeline (S3, Glue, Redshift) processing 2TB+ records for model training and inference.

---

### IIIT Bangalore — Research Intern
**May 2023 – Aug 2023 | Bangalore, India**

- Fine-tuned LLMs with LoRA on domain-specific medical corpora, increasing classification accuracy by 40% and achieving 80% precision on native language health dialogues.

---

### AbitiKart — Machine Learning Intern
**May 2022 – Jul 2022 | Remote**

- Improved eCommerce product categorization accuracy to 94% by optimizing embeddings and reducing manual review effort by 24%.

---

## Technical Case Studies & Projects

**Real-Time Journey Engine** | PyFlink, Kafka, Redis
- DAG-based event-driven orchestration with stateful streaming processing. Handles 100K+ events/day with p99 latency <100ms and exactly-once guarantees.

**AI Voice Caller System** | Google AI SDK, Plivo, FastAPI
- Voice AI platform executing 1K+ outbound calls/day. Real-time speech transcription for 5+ Indic languages. Automated lead scoring and CRM integration.

**Metadata-Driven CDP Data Platform**
- Metadata-first architecture, BigQuery optimization, Bronze-Silver-Gold layers, cost savings breakdown, and self-service analytics.

**High Scale Consumer Auto Healing**
- Engineered a 99% reliable Kafka framework for 10M+ events/day, preventing 67 schema breaks.

---

## Education & Accomplishments

- **Bangalore Institute of Technology** | B.E in Information Science (CGPA: 8.43) | 2024
- **Competitive Programming:** Ranked 3-star on CodeChef (Rating: 1784) | 5-star in Problem Solving & Python on HackerRank
- **GSSOC Fellow:** 3-month Open Source Fellowship focused on high-scale distributed systems
- **Technical Leadership:** Eval/Evaluator for 100+ coding contests; prepared/evaluated competitive algorithmic questions
