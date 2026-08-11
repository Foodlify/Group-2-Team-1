import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { authenticate } from "../../middlewares/auth.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./rating.controller";
import {
  CreateRatingRequestSchema,
  DiscoveryQuerySchema,
} from "./rating.validation";
import { RestaurantIdParamsSchema } from "../restaurant/restaurant.validation";
import { PaginationQuerySchema } from "../../shared/schemas/pagination.schema";

export const myRatingsRouter: Router = Router();
myRatingsRouter.use(authenticate);
myRatingsRouter.post(
  "/",
  validate({ body: CreateRatingRequestSchema }),
  controller.rateOrder,
);
myRatingsRouter.get("/", controller.listMyRatings);

export const restaurantRatingsRouter: Router = Router({ mergeParams: true });
restaurantRatingsRouter.get(
  "/",
  validate({ params: RestaurantIdParamsSchema, query: PaginationQuerySchema }),
  controller.listRestaurantRatings,
);

export const restaurantDiscoveryRouter: Router = Router();
restaurantDiscoveryRouter.get(
  "/top-rated",
  validate({ query: DiscoveryQuerySchema }),
  controller.topRatedRestaurants,
);
restaurantDiscoveryRouter.get(
  "/recommendations",
  authenticate,
  validate({ query: DiscoveryQuerySchema }),
  controller.recommendedRestaurants,
);

const tag = "Ratings";
const errorRef = { $ref: "#/components/schemas/ErrorResponse" };
const validationErrorRef = {
  $ref: "#/components/schemas/ValidationErrorResponse",
};
const security: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { BearerAuth: [] },
];
const jsonRef = (ref: string) => ({
  "application/json": { schema: { $ref: `#/components/schemas/${ref}` } },
});

routeRegistry.push({
  path: "/api/v1/customers/me/ratings",
  pathItem: {
    post: {
      tags: [tag],
      summary: "Rate the restaurant of a delivered order",
      security,
      requestBody: { required: true, content: jsonRef("CreateRatingRequest") },
      responses: {
        "201": {
          description: "Rating submitted",
          content: jsonRef("RatingSuccessResponse"),
        },
        "400": {
          description: "Validation failed / order not delivered yet",
          content: { "application/json": { schema: validationErrorRef } },
        },
        "403": {
          description: "Not a customer account",
          content: jsonRef("ErrorResponse"),
        },
        "404": {
          description: "Order not found (or not yours)",
          content: jsonRef("ErrorResponse"),
        },
        "409": {
          description: "Order already rated",
          content: jsonRef("ErrorResponse"),
        },
      },
    },
    get: {
      tags: [tag],
      summary: "List my ratings",
      security,
      responses: {
        "200": {
          description: "My ratings, newest first",
          content: jsonRef("RatingListSuccessResponse"),
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/restaurants/{restaurantId}/ratings",
  pathItem: {
    get: {
      tags: [tag],
      summary:
        "Restaurant ratings: average + count + paginated comments (public)",
      parameters: [
        {
          name: "restaurantId",
          in: "path",
          required: true,
          schema: { type: "string" as const },
        },
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20 },
        },
      ],
      responses: {
        "200": {
          description: "Summary + ratings",
          content: jsonRef("RestaurantRatingsSuccessResponse"),
        },
        "404": {
          description: "Restaurant not found",
          content: { "application/json": { schema: errorRef } },
        },
      },
    },
  },
});

const limitParam = {
  name: "limit",
  in: "query",
  schema: { type: "integer" as const, default: 10 },
  description: "Number of restaurants to return (max 50)",
} as const;

routeRegistry.push({
  path: "/api/v1/restaurants/top-rated",
  pathItem: {
    get: {
      tags: [tag],
      summary: "Top rated restaurants (public)",
      description:
        "Restaurants ranked by average rating (SQL aggregate), ties broken by ratings count. Restaurants without ratings are excluded.",
      parameters: [limitParam],
      responses: {
        "200": {
          description: "Top rated restaurants",
          content: jsonRef("TopRatedListSuccessResponse"),
        },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/restaurants/recommendations",
  pathItem: {
    get: {
      tags: [tag],
      summary: "Restaurant recommendations for the current customer",
      description:
        "The top-rated restaurants the customer hasn't ordered from yet — a customer with no order history gets the plain top-rated list.",
      security,
      parameters: [limitParam],
      responses: {
        "200": {
          description: "Recommended restaurants",
          content: jsonRef("TopRatedListSuccessResponse"),
        },
        "403": {
          description: "Not a customer account",
          content: jsonRef("ErrorResponse"),
        },
      },
    },
  },
});
