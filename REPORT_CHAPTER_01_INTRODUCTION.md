# Chapter 1: Introduction — WattGuard (SHEMS)

**For:** Foundation University Islamabad — FYP Report  
**Team:** Mir Hazik Gul (F22-BSSE-030), Salma Mumtaz (F22-BSSE-052), Sufiyan Gul (F22-BSSE-060)  
**Advisor:** Mr. Tahseen Haider · **Coordinator:** Ms. Rabiya Ghafoor

> **Turnitin note:** This text is written for your project. Before submission, run the full report through Turnitin. Add **numbered references** where marked `[Ref]` and cite them in IEEE/APA style as required by FUI. Paraphrase any source you read; do not paste from Wikipedia, ChatGPT dumps, or other students’ reports. Tables of facts (benchmarking) are fine if features are your own comparison.

---

## Chapter 1  
## INTRODUCTION

### 1.1 Introduction

The Final Year Project (FYP) is a degree requirement at Foundation University Islamabad (FUI) through which students demonstrate that they can analyse a real problem, design a solution, implement it, and evaluate the outcome. This report documents **WattGuard**, developed under the academic title **SHEMS (Smart Home Energy Management System)**. WattGuard is a web-based application that helps residential users see how electricity is consumed in their home, estimate cost using Pakistan-oriented tariff logic, receive timely alerts, and view short-term usage forecasts produced by a machine-learning model.

Household electricity in Pakistan is increasingly expensive and structurally complex. Distribution companies (DISCOs) such as IESCO apply **slab-based** residential tariffs, and crossing usage thresholds (for example the 200-unit protection limit) can change how the entire monthly bill is calculated. At the same time, many homes still depend on a single analogue or digital meter reading once per month, which gives no visibility into **which appliance** drives cost or **when** demand is highest. Load shedding and seasonal variation (especially air-conditioning in summer) make manual guesswork even less reliable.

WattGuard addresses this visibility gap by combining three ideas: **per-circuit monitoring** through low-cost hardware, **centralised storage and analysis** on a secure server, and **actionable presentation** in a browser dashboard. An ESP32 microcontroller reads a PZEM-004T energy sensor and sends voltage, current, power, and cumulative energy to the backend over Wi-Fi. Users interact through a React front end; authentication uses JSON Web Tokens (JWT), while each meter authenticates with its own device token so hardware never stores the household login password.

This chapter introduces the background and motivation for the project (Section 1.2), summarises related work (Section 1.3), states the problem formally (Section 1.4), positions the system with a context diagram (Section 1.5), and lists end-user needs that guided design (Section 1.6). Later chapters describe the proposed system, requirements, design, implementation, and testing in detail.

---

### 1.2 Existing System

Today, most Pakistani households interact with electricity in one or more of the following ways, none of which fully supports proactive home energy management:

**1. Utility meter only**  
The DISCO meter records total consumption for billing. The customer receives a monthly bill but cannot see daily curves, per-room usage, or the effect of a single appliance without additional metering.

**2. Mobile apps from power companies**  
Some DISCOs offer bill inquiry or outage information. These services focus on **billing and complaints**, not live per-device telemetry or user-defined limits on home circuits.

**3. Commercial energy dashboards (international)**  
Products such as Sense, Neurio, Ecoisme, and Bidgely target mainly North American or European markets. They emphasise disaggregation or analytics but generally do **not** implement Pakistani slab tariffs, protected vs unprotected consumer rules, or low-cost ESP32-based deployment suitable for a university prototype budget.

**4. Basic smart plugs**  
Individual Wi-Fi plugs can switch loads and show watts for one socket. Scaling to a whole home requires many devices, unified history, and consistent cost logic—areas where a dedicated platform adds value.

Common limitations of these approaches include: passive display without **forecasting**, no integration of **solar estimation** with home load, weak support for **user-defined alerts** (offline meter, power cap, daily kWh cap), and no **local tariff engine** that admins can update when regulatory schedules change.

**Table 1.1: Benchmarking of energy monitoring solutions**

| Feature / Tool | Sense | Neurio | Ecoisme | Bidgely | WattGuard (FYP) |
|----------------|:-----:|:------:|:-------:|:-------:|:-----------------:|
| Energy consumption analytics | ✓ | ✓ | ✓ | ✓ | ✓ |
| Per-device / circuit telemetry | Limited | ✓ | ✓ | ✓ | ✓ (PZEM + tokens) |
| ML usage forecasting | ✗ | ✗ | ✗ | ✓ | ✓ (Random Forest) |
| Pakistan slab / IESCO-style costing | ✗ | ✗ | ✗ | ✗ | ✓ |
| Solar generation estimate | ✗ | ✗ | ✓ | ✗ | ✓ |
| Remote relay / schedule / limits | ✗ | ✓ | ✗ | ✗ | ✓ |
| Open self-hosted web platform | ✗ | ✗ | ✗ | ✗ | ✓ (Django + React) |

*Note: Commercial tools evolve; this table reflects capabilities relevant to our FYP comparison at submission time.*

---

### 1.3 Literature Review

Research on residential energy management has moved from **manual logging** and monthly bills toward **instrumented homes** where sensors stream data to cloud or edge servers [Ref]. Early smart-meter deployments showed that giving users feedback—even simple daily totals—can reduce consumption, but effect sizes depend on interface clarity and whether feedback is near real time [Ref].

The **Internet of Things (IoT)** literature describes architectures in which constrained devices (microcontrollers) publish measurements to a broker or REST API, and applications aggregate multi-device views for one dwelling [Ref]. Security studies stress **separate credentials** for users and devices; WattGuard follows this by using JWT for the browser and opaque device tokens for ESP32 uploads.

**Machine learning** for load forecasting is widely reported: regression and tree-based models (including Random Forest) are common baselines for daily or hourly kWh prediction because they handle nonlinear patterns without demanding very large training sets [Ref]. Challenges include **distribution shift**—for example when a household suddenly runs heavy loads for testing—so production systems often blend model output with recent averages and explain uncertainty to users.

**Renewable integration** work highlights coupling consumption with **solar irradiance** or weather APIs to estimate self-consumption and grid import [Ref]. For homes with rooftop PV, aligning discretionary loads with generation can lower bills; even without hardware inverters, estimated solar curves help users reason about daytime surplus.

**Tariff-aware energy systems** are less common in international papers but critical in Pakistan. NEPRA and DISCO schedules use **progressive slabs** and protection rules that are not equivalent to a single rupees-per-unit multiplier [Ref]. Systems that ignore slabs misstate cost and undermine trust.

Gaps identified in the literature—and motivating WattGuard—include: (i) affordable **circuit-level** monitoring linked to a unified dashboard, (ii) **local tariff models** editable when rates change, (iii) **forecasting plus recommendations** in one household-facing product, and (iv) **hardware provisioning** that does not require reflashing firmware for every new device account. WattGuard is our engineered response to these gaps within FYP scope.

**Suggested references to add (replace [Ref] in Word):**  
Search Google Scholar for: “smart home energy IoT survey”, “random forest energy consumption forecasting”, “NEPRA residential tariff structure”, “feedback effect electricity consumption”. Pick 4–6 papers/reports from 2018–2025 and cite in FUI format.

---

### 1.4 Problem Definition

**Problem statement:** Residential electricity users in Pakistan lack an integrated, affordable tool to monitor per-circuit consumption in near real time, translate usage into **accurate PKR estimates** under slab billing, be warned when devices go offline or exceed safe limits, and plan ahead using data-driven forecasts.

**Specific issues:**

1. **Low transparency** — The main meter does not attribute kWh to AC, PC, lighting, or other circuits.  
2. **Tariff complexity** — Protected vs unprotected classification and multi-slab rates make mental arithmetic difficult.  
3. **Reactive billing** — Users see cost after the month ends, not while behaviour can still be changed.  
4. **No unified alerts** — Outages, runaway loads, or forgotten appliances are discovered late.  
5. **Weak planning** — Without short-term forecasts, users cannot anticipate monthly units approaching slab boundaries (e.g. 200 kWh).

**Proposed direction:** Build WattGuard as a three-tier web system (React client, Django REST API, SQLite database) with ESP32 + PZEM hardware for at least one live circuit, synthetic or scripted data for additional demo circuits, slab billing in the backend, stored alerts, and a trained Random Forest model for 7- and 30-day forecasts.

---

### 1.5 Context Diagram

A **context diagram** shows WattGuard as a single process at the centre of external entities. Update your Figure 1.1 to match the implemented system:

**Central process:** WattGuard System (SHEMS)

**External entities and flows:**

| Entity | To / from system | Data / action |
|--------|------------------|---------------|
| **Home user** | ↔ | Login, view dashboard, reports, forecasts, settings, acknowledge alerts, toggle relay, set limits |
| **ESP32 + PZEM meter** | → | Telemetry: voltage, current, power, energy_kWh (`X-DEVICE-TOKEN`) |
| **ESP32 + PZEM meter** | ← | Relay state, schedule, power/daily limits (`GET state-by-token`) |
| **OpenWeather API** (optional) | → | Cloud cover, sunrise/sunset for solar estimate |
| **Django admin (staff)** | ↔ | Update `TariffPlan` / `TariffSlab` rates when DISCO schedules change |

*Figure 1.1: Context Diagram — (insert diagram in Word; keep labels consistent with above table.)*

---

### 1.6 User Needs

From discussions of typical household and FYP demo scenarios, the following user needs were identified:

1. **Real-time visibility** — See current power (W) and energy (kWh) per registered device and for the whole home.  
2. **Historical analysis** — View charts over days/weeks/months and export reports for record-keeping.  
3. **Cost in PKR** — Today’s spend and month-to-date estimates using IESCO A-1-style slabs when enabled.  
4. **Protection awareness** — Understand whether recent months keep the user under protected-consumer thresholds.  
5. **Short-term forecasting** — Predict next-week usage and cost from past patterns, with clear messaging when data is unusual (e.g. stress testing).  
6. **Actionable tips** — Recommendations based on trends, top devices, and solar configuration.  
7. **Alerts** — Notification when a meter stops reporting (~60 s), exceeds a user-set power limit, or exceeds a daily kWh cap.  
8. **Optional control** — Turn a controllable load on/off and define simple schedules from the web UI, with the device fetching commands over Wi-Fi.  
9. **Solar insight** — For homes with PV, estimate generation and savings using capacity and weather.  
10. **Simple onboarding** — Register online, add devices, copy a token, provision ESP32 once via Wi-Fi captive portal without reprogramming for each new account.

These needs map to functional requirements in Chapter 3 and features F-01 through F-04 in Chapter 2.

---

## Turnitin checklist (5 marks — do not lose easy points)

| Do | Avoid |
|----|--------|
| Cite every statistic, definition, or paper with `[1]`, `[2]`… | Copying paragraphs from websites or old group drafts unchanged |
| Write in your team’s own sentences | Submitting the same chapter another group used |
| Quote sparingly with quotation marks + citation | Letting AI generate whole sections you never read |
| Run Turnitin **before** final print | High similarity on “Existing System” boilerplate—rewrite it |
| Keep **Statement of Originality** signed | Forgetting to reference your own benchmarking table source if you copied feature lists from vendor sites |

**Target similarity:** Many universities expect mostly **original** narrative; technical terms (JWT, ESP32, Random Forest) will match others— that is normal. Problem is **long identical passages**.

---

*Next chapter: Chapter 2 — Introduction to Proposed System (objectives, scope, features table, use case diagram).*
