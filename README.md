# 📚 ECOMMERCE PROJECT README

## Table of Contents

- [Overview](#overview)
- [Vision](#vision)
- [Mission](#mission)
- [Actors of the System](#actors-of-the-system)
- [Functional Requirements](#functional-requirements)
- [Non Functional Requirements](#non-functional-requirements)
- [ERD](#erd)
- [User Stories](#user-stories)
- [Flow Charts](#flow-charts)
- [Sequence Diagrams](#sequence-diagrams)
- [Assumptions](#assumptions)
- [Tech Stack](#tech-stack)
- [Setup & Installation Guide](#setup--installation-guide)
- [API Documentation](#api-documentation)
- [Testing Suite](#testing-suite)

---

## 🗂️Overview

Foodlify is an e-commerce platform dedicated to revolutionizing the dining and food delivery experience. It connects customers with various restaurants, allowing them to browse menus, manage shopping carts, and place orders intuitively. The system supports robust user management with distinct roles, extensive restaurant menu configurations, real-time order tracking, and secure multi-option payment integrations to ensure a smooth end-to-end transaction.

---

## 🧭Vision

To become the leading and most trusted food-commodity e-commerce ecosystem, providing a seamless bridge between culinary businesses and customers through innovative technology. We aim to make quality food globally accessible while empowering restaurants to scale their reach digitally.

---

## 🎯Mission

To deliver a reliable, intuitive, and scalable food delivery platform that simplifies the ordering process for customers. We strive to provide restaurants with robust tools to manage their menus, track orders, and process payments securely and efficiently.

---

## 👥Actors of the System

1. **End User (Customer)** will be able to:

- Discover many categories of restaurants.
- Create his own cart and adjust it.
- Complete purchasing order with multiple payment methods.
- Real-time tracking of his order status.
- Get high levels of customer service satisfaction.

2. **Restaurant Owner** will be able to:

- Add his restaurant information and its related menus through simple interactive platform.
- View his required orders and interact with them.
- Monitor his progress through analytical and reporting dashboard.

3. **Delivery Rider** will be able to:

- Accept/decline delivery requests
- Navigate to pickup & drop-off
- Update delivery status
- View earnings

4. **System Admin** will be able to:

- Overview and manage entire platform.
- Manage users and restaurants accounts.
- Monitor Orders and disputes.
- Configure promotions.
- access to dashboards and reporting tools.

5. **System** Should be able to:

- Ensure reliable order processing.
- Maintain data consistency.
- Enable real-time communication.

<!-- List and describe all actors (users, systems, roles) that interact with the system. -->

---

## 📦Functional Requirements

### Features:

1. User Registration & Authentication.
2. Restaurant & Menu Management.
3. Cart Management.
4. Order Management.
5. Payment Integration Management.
6. Customer Support Management.
7. Notification & Email Management
8. Dashboard & Reports

### Functions:

### 1. User Registration & Authentication

        1. Create Account /Sign Up
        2. Login
        3. Logout
        4. Forget Password
        5. Enable/Disable Account
        7. User Profile: Show, Edit.

### 2. Restaurant & Menu Management

        1. Add Restaurant
        2. Update Restaurant
        3. Delete Restaurant
        4. View Restaurants - Categories Tabs - Recommendations - Near You - Daily Offers- Top Rating ...
        5. View Single Restaurant
        6. Search Restaurant
        7. Add Menu
        8. Update Menu
        9. Delete Menu
        10. View Menu
        11. Filter Menu / Item

### 3. Cart Management

        1. Add to cart
        2. Modify cart
            2.1 Add items
            2.2 Remove items
            2.3 Change quantity (+, -)
        3. Clear cart
        4. Checkout

### 4. Order Management

        1. Place Order
        2. Receive order by restaurant
        3. Cancel Order by customer/restaurant
        4. Track Order
        5. View Order summary
        6. View Order details
        7. View Orders History
        8. Update Order Status
        9. Send Email confirmation
        10. Send order status notification

### 5. Payment Integration Management

        1. Payment Integration with 3rd Party
        2. Select Payment method
        3. Create Transaction
        4. View Payment Transaction
        5. Create Transaction Receipt
        6. send Email Notification

### 6. Customer support Management

        1. Raise a Complain
        2. Add Rate to restaurant
        3. Need Help
        4. Customer Add Card

---

## ⚙️Non Functional Requirements
| #  | NFR Category        | Detailed Requirement                       | Architecture Decisions                                                | Technologies / Tools               |
| -- | ------------------- | ------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------- |
| 1  | Performance         | API response time ≤ 300 ms, page load ≤ 2s | Use in-memory caching, CDN for static assets, DB indexing, pagination | Redis, Cloudflare / AWS CloudFront |
| 2  | Performance         | Handle high read traffic efficiently       | Cache frequently accessed data (restaurants, menus)                   | Redis                              |
| 3  | Scalability         | Support 10k+ concurrent users              | Horizontal scaling with stateless services                            | Docker, Kubernetes                 |
| 4  | Security            | Encrypt all data in transit                | Enforce HTTPS (TLS) across all services                               | TLS                                |
| 5  | Security            | Secure password storage                    | Hash passwords with strong algorithms                                 | bcrypt                             |
| 6  | Security            | Secure authentication                      | Token-based authentication                                            | JWT                                |
| 7  | Security            | Prevent common attacks (SQLi, XSS, CSRF)   | Rate limiting, input validation, WAF, API protection                  | NGINX, API Gateway                 |
| 8  | Security            | Secure payment processing                  | Use PCI-compliant payment gateway                                     | Stripe                             |
| 9  | Availability        | System uptime ≥ 99.9%                      | Multi-instance deployment, no single point of failure                 | Kubernetes                         |
| 10 | Availability        | Ensure service continuity                  | Health checks + auto-restart failed services                          | Kubernetes                         |
| 11 | Reliability         | No data loss in orders                     | Use transactional DB operations                                       | PostgreSQL                         |
| 12 | Reliability         | Prevent duplicate orders/payments          | Idempotency keys for critical APIs                                    | Redis / DB                         |
| 13 | Reliability         | Handle partial failures                    | Retry mechanisms + circuit breakers                                   | App logic / middleware             |
| 14 | Usability           | Smooth and fast UX                         | Lazy loading, optimized UI, minimal steps                             | React / Next.js                    |
| 15 | Compatibility       | Support web and mobile platforms           | API-first architecture                                                | REST API                           |
| 16 | Maintainability     | Easy to extend and modify                  | Clean architecture (controller → service → repository)                | Service-based design patterns      |
| 17 | Maintainability     | Code consistency                           | Linting and formatting tools                                          | ESLint, Prettier                   |
| 18 | Observability       | Monitor system performance                 | Metrics collection and visualization                                  | Prometheus, Grafana                |
| 19 | Observability       | Log all critical events                    | Structured logging system                                             | Winston                            |
| 20 | Payment Reliability | Payment success rate ≥ 99%                 | Retry failed payments, use webhooks                                   | Stripe, Queues                     |
| 21 | Network             | Handle poor network conditions             | Retry logic, timeout handling                                         | Client + Server logic              |
| 22 | Network             | Improve perceived performance              | Offline UI fallback (cached data)                                     | Browser cache                      |
| 23 | Testability         | Ensure code quality                        | Unit and integration testing                                          | Jest, Supertest                    |



## 📊ERD

```mermaid
erDiagram
	direction TB
	RESTAURANT {
		int restaurant-id PK ""
		string name  ""
		int menu-id FK ""
	}

	MENU {
		int menu-id PK ""
		int restruent-id FK ""
	}

	PAYMENT-INTEGRATION-TYPE {
		int id PK ""
		string name  ""
	}

	USER-TYPE {
		int user-id PK ""
		string name  ""
	}

	ROLE {
		int role-id PK ""
		string name  ""
	}

	USER-ROLE {
		int user-id FK ""
		int role-id FK ""
	}

	CUSTOMER {
		int id PK ""
		int user-id FK ""
	}

	ADDRESS {
		int id PK ""
		int user-id FK ""
		string city  ""
		string country  ""
		int post_code  ""
	}

	ORDER {
		int order-id PK ""
		int user-id FK ""
		string address  ""
		date date  ""
	}

	ORDER-ITEMS {
		int order-item-id PK ""
		int order-id FK ""
		int item-id FK ""
		int quantity  ""
	}

	ORDER-STATE {
		int id PK ""
		string status  ""
	}

	ORDER-TRACKING {
		int order-id FK ""
		string current-location  ""
		date estimat-time  ""
	}

	PREFERRED-PAYMENT-SETTINGS {
		int id PK ""
		int user-id FK ""
		int pay-config-id FK ""
	}

	PAYMENT-CONFIGURATIONS {
		int id PK ""
		int pay-integra-id FK ""
		string config-details  ""
	}

	AUDITING {
		int id PK ""
		string type-id  ""
		string details  ""
		date audit-date  ""
	}

	TRANSACTION {
		int id PK ""
		int order-id FK ""
		int amount  ""
		string status  ""
	}

	TRANSACTION-DETAILS {
		int id PK ""
		string details  ""
	}

	PAYMENT-STATUS {
		int id PK ""
		string name  ""
	}

	CART {
		int user-id PK ""
		string name  ""
	}

	CART-ITEMS {
		int id PK ""
		int cart-id FK ""
		int menu-item-id FK ""
		int quantity  ""
	}

	MENU-ITEMS {
		int item-id PK ""
		int menu-id FK ""
		string item-name  ""
		int price  ""
	}

	USER {
		int user-id PK ""
		string name  ""
		string email  ""
	}

	RESTAURANT||--o{MENU:"has"
	USER-TYPE||--o{USER:"defines"
	ROLE||--o{USER-ROLE:"contains"
	USER||--o{USER-ROLE:"has"
	USER||--o{CUSTOMER:"is"
	USER||--o{ADDRESS:"has"
	USER||--o{PREFERRED-PAYMENT-SETTINGS:"configures"
	CUSTOMER||--o{ORDER:"places"
	ORDER||--o{ORDER-ITEMS:"contains"
	ORDER||--o{ORDER-STATE:"has"
	ORDER||--o{ORDER-TRACKING:"tracks"
	MENU||--o{MENU-ITEMS:"contains"
	PAYMENT-INTEGRATION-TYPE||--o{PAYMENT-CONFIGURATIONS:"uses"
	PAYMENT-CONFIGURATIONS||--o{PREFERRED-PAYMENT-SETTINGS:"configures"
	AUDITING||--o{TRANSACTION:"records"
	TRANSACTION||--o{TRANSACTION-DETAILS:"has"
	TRANSACTION||--o{PAYMENT-STATUS:"has"
	CART||--o{CART-ITEMS:"contains"
	CART-ITEMS||--o{MENU-ITEMS:"contains"
```

<!-- Include the Entity Relationship Diagram (ERD) here. You can embed an image or link to it. -->

---

## User Stories

### Epic 3: Cart Management

- **Feature name**: Cart Management
- **Description**: Showing all User stories related to creating a cart then adding, modifying and deleting items within it.
- **Acceptance Criteria**: Gherkin
- **Story 3-1**: Add To Cart

```gherkin
  As a customer
  I want to create my cart and add items to it
  So that I can review and modify my order before checkout
Background:
    Given the user is logged in
     And  the user has selected a restaurant
Happy_cases:
  Scenario_1: Add item to cart successfully
     Given the menu item is available
     When  the user adds the item to the cart
     Then  the item should be added to the cart
      And  the cart total should be updated
Edge cases:
  Scenario_1: Add unavailable item to cart
     Given the menu item is unavailable
     When  the user tries to add the item to the cart
     Then  the action should be prevented
      And  an error message should be displayed
```

- **Story 3-2**: Modify Cart- Remove item

```gherkin
  As a customer
  I want to manage my cart
  So that I can review and modify my order before checkout

Happy_cases:
  Scenario_1: Remove item from cart
     Given the cart contains an item
     When  the user removes the item
     Then  the item should be removed from the cart
      And  the cart total should be updated
```

- **Story 3-3**: Modify Cart- Modify item quantity

```gherkin
  As a customer
  I want to manage my cart
  So that I can review and modify my order before checkout

Happy_cases:
  Scenario_1: Modify item quantity in cart successfully
    Given the cart contains an item
    When  the user increases or decreases the item quantity
    Then  system checks stock in case of increase
     And  enough quantity response
     And  the item quantity should be updated
     And  the cart total should be recalculated
Edge cases:
  Scenario_1: Modify cart with invalid quantity
    Given the cart contains an item
    When  the user increases the item quantity
    Then  system check stock in case of increase
     And  No enough quantity response
    Then  the system should show low stock error
     And  the quantity should not be updated
```

- **Story 3-4**: Clear Cart

```gherkin
  As a customer
  I want to clear my cart
  So that I no more need now

Happy_cases:
  Scenario: Clear entire cart
    Given the cart contains multiple items
    When  the user chooses to clear the cart
    Then  all items should be removed from the cart
     And  the cart should be empty
```

- **Story 3-4**: View Cart

```gherkin
  As a customer
  I want to view my cart
  So that I can review and modify my order before checkout

Happy_cases:
  Scenario: View cart details
    Given the cart contains items
    When  the user views the cart
    Then  all items with their quantities and prices should be displayed
     And  the total amount should be shown
```

---

## 🔄Flow Charts

### 3- Cart Management

```mermaid
flowchart TD

A[User] --> B{Choose Action}

%% ================= VIEW CART =================
B -->|View Cart| C[Load Cart]
C --> D{Cart Empty}

D -- Yes --> E[Show Empty Cart]
D -- No --> F[Display Cart Items]

%% ================= ADD ITEM =================
B -->|Add Item| G[Select Menu Item]
G --> H{Item Available}

H -- No --> I[Show Error Not Available]
H -- Yes --> J{Same Restaurant}

J -- No --> K[Prompt Clear Cart or Cancel]
K --> B
J -- Yes --> L[Add Item to Cart]
L --> M[Update Total]

%% ================= MODIFY QUANTITY =================
B -->|Update Quantity| N[Select Cart Item]
N --> O[Change Quantity]
O --> P{Valid Quantity}

P -- No --> Q[Show Validation Error]
P -- Yes --> R[Update Quantity]
R --> M

%% ================= REMOVE ITEM =================
B -->|Remove Item| S[Select Cart Item]
S --> T[Remove Item]
T --> U[Update Cart Total]

%% ================= CLEAR CART =================
B -->|Clear Cart| V[Confirm Clear Cart]
V --> W[Remove All Items]
W --> X[Cart Empty]

%% ================= END =================
M --> Y[Show Updated Cart]
U --> Y
F --> Y
X --> Y
```

<!-- Include flow charts that illustrate the main processes and workflows of the system. -->

---

## 🧩Sequence Diagrams

### 3- Cart Management

```mermaid
sequenceDiagram
    actor User
    participant UI as Frontend (App/Web)
    participant API as Backend API
    participant Cart as Cart Service
    participant DB as Database

    %% =========================
    %% Add to Cart
    %% =========================
    User->>UI: Click "Add to Cart"
    UI->>API: POST /cart/items {productId, qty}
    API->>Cart: addItem(userId, productId, qty)
    Cart->>DB: Upsert cart item
    DB-->>Cart: Success
    Cart-->>API: Updated cart
    API-->>UI: 200 OK + cart data
    UI-->>User: Show updated cart

    %% =========================
    %% Modify Item Quantity
    %% =========================
    User->>UI: Change item quantity
    UI->>API: PATCH /cart/items/{itemId} {qty}
    API->>Cart: updateItem(userId, itemId, qty)
    Cart->>DB: Update quantity
    DB-->>Cart: Success
    Cart-->>API: Updated cart
    API-->>UI: 200 OK + cart data
    UI-->>User: Show updated cart

    %% =========================
    %% Remove Item (edge case)
    %% =========================
    User->>UI: Set qty = 0 / Remove item
    UI->>API: DELETE /cart/items/{itemId}
    API->>Cart: removeItem(userId, itemId)
    Cart->>DB: Delete item
    DB-->>Cart: Success
    Cart-->>API: Updated cart
    API-->>UI: 200 OK
    UI-->>User: Item removed

    %% =========================
    %% Clear Cart
    %% =========================
    User->>UI: Click "Clear Cart"
    UI->>API: DELETE /cart
    API->>Cart: clearCart(userId)
    Cart->>DB: Delete all cart items
    DB-->>Cart: Success
    Cart-->>API: Empty cart
    API-->>UI: 200 OK
    UI-->>User: Cart is empty
```

<!-- Include sequence diagrams that show how components interact over time for key use cases. -->

---

## 🧾Assumptions

<!-- List any assumptions made during design or development of the system. -->

---

## Tech Stack

- **Runtime & Environment:** Node.js
- **Backend Framework:** Express.js
- **Database:** PostgreSQL
- **ORM:** Prisma
- **API Documentation:** Swagger / OpenAPI
- **Containerization:** Docker
- **Version Control:** Git & GitHub

---

## 🚀Setup & Installation Guide

Follow these steps to set up the backend environment locally:

### Prerequisites

- Node.js (v25.9.0) - _We provide an `.nvmrc` file for easy switching via `nvm use`_
- Docker & Docker Compose
- Git

### Installation Steps (Local Environment)

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Foodlify/Group-1-Team-1.git
   cd Group-1-Team-1
   ```

2. **Select the correct Node version:**
   ```bash
   nvm use
   ```

#### When run on local machine

3. **Install Dependencies:**

   ```bash
   npm install
   ```

4. **Environment Setup:**
   Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

   _Make sure your `.env` contains the correct `DATABASE_URL` (e.g., `postgresql://user:password@localhost:5432/foodlify`)._


5. **Database Migration:**

```bash
   npx prisma generate
   npx prisma migrate dev --name init
```

6. **Database seed:**
```bash
  npx prisma db seed
```

7. **Start the Development Server:**

   ```bash
   npm run dev
   ```


#### When run on docker 
1. **Start the api and database (Docker):**

```bash
docker-compose up -d
```

2. **Database Migration:**

   ```bash
    docker exec -it foodlify_api prisma generate
    docker exec -it foodlify_api npx prisma db push
   ```

3. **Database seed:**
```bash
   docker exec -it foodlify_api npx prisma db seed
```
---


## API Documentation

Once the server is running, explore the Swagger documentation at:
`http://localhost:3000/api-docs`

---

## 🧪Testing Suite

<!-- Describe the testing strategy, tools used, and how to run the tests. -->

---
