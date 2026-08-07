# TypeScript Topics Used in This Project

## 1. Type Annotations

- Variable, parameter, and return type annotations
- `void`, `unknown`, `never` types

## 2. Type Aliases & Interfaces

- `type` aliases
- `interface` declarations
- Type alias composition

## 3. Generics

- Generic type parameters `<T>`
- Generic constraints (`extends`)
- Default type parameters (`<T = DefaultType>`)
- Multiple generic parameters

## 4. Utility Types

- `Partial<T>`
- `Pick<T, K>`
- `Omit<T, K>`
- `Record<K, V>`
- `Awaited<T>`
- `NonNullable<T>`
- `ReturnType<T>`
- `Parameters<T>`

## 5. Conditional Types

- `T extends U ? X : Y`
- `infer` keyword

## 6. Mapped Types

- `[P in K]: T[P]`
- `keyof` operator
- `typeof` operator

## 7. Union Types

- `A | B`
- Discriminated unions

## 8. Classes (OOP in TypeScript)

- `abstract` classes
- Class inheritance (`extends`)
- Access modifiers: `private`, `protected`, `readonly`
- Constructor typing

## 9. Type Guards

- `instanceof` checks
- Type narrowing

## 10. Type Assertions

- `as` keyword
- `as unknown as T`
- `as const`

## 11. Function Types

- Typed arrow functions
- Higher-order functions
- Generic function signatures

## 12. Optional & Nullish Features

- Optional properties (`?`)
- Optional chaining (`?.`)
- Nullish coalescing (`??`)
- Non-null assertion (`!`)

## 13. Literal Types

- String literal types
- `as const` for literal inference

## 14. Index Signatures

- `[key: string]: T`
- Computed property names

## 15. Schema-Driven Type Inference (Zod)

- `z.infer<typeof Schema>`

## 16. Generic Middleware Pattern

- `validate<T extends ZodType>`

## 17. Intersection Types

- `A & B`
