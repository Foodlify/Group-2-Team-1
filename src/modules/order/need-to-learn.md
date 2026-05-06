- asyncHandler
- why class in service file?
- meta ?
- schemaRegistry ?? this file ?
- // what is the benefit of this line ?
  schemaRegistry.register("OrderResponse", OrderResponseSchema);

- // all details of this line ?
  export type OrderResponse = z.infer<typeof OrderResponseSchema>;

<!-- and this line what is the benefit -->

- .meta({ id: "OrderResponse" });

<!-- // this line i need to understand more about -->
<!-- // - prisma client -->
<!-- // - BaseRepository -->
<!-- // - -->

<!--  29/4/2026 -->

- this in class typescript
- openapi documentation

```js
 schemaRegistry.register("OrderResponse", OrderResponseSchema); - This line registers the schema with a name ("OrderResponse") so the OpenAPI generator can reference it by name in the API spec. This enables:
   - Reusable schema definitions in OpenAPI
   - Cross-references ($ref) instead of duplicating schema definitions
   - Cleaner API documentation
```

`.meta({ id: "OrderResponse" }); - In Zod v4, this attaches metadata to the schema. The id is typically used for OpenAPI schema identification. This is similar to schemaRegistry.register but uses Zod's native metadata system.`

they need to dig into further.
