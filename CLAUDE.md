## Core Functional Programming Principles

### Pure Functions
- Functions must be deterministic: same input always produces same output
- No side effects: no mutations, no I/O, no logging inside pure functions
- Separate pure logic from effects (API calls, file operations, network requests)

### Immutability
- Use `const` by default; avoid `let` unless mutation is truly necessary
- Never mutate function arguments or objects passed as parameters
- Use spread operator, map, filter, reduce instead of push, splice, pop
- Fluent builders return new objects via spread: `{ ...state, key: val }` (NOT `this.key = val`)

### Composition
- Build complex behavior from small, composable functions
- Each function should do one thing well
- Prefer function composition over inheritance or large classes

### Explicit Data Flow
- Make dependencies visible in function signatures
- Pass data explicitly through parameters
- Return transformed data rather than mutating in place

### Avoid Shared Mutable State
- No global variables or module-level mutable state
- Isolate state changes to explicit boundaries (I/O layer)

---

## Code Organization

### Module Boundaries
- Each module should have a single, clear purpose
- Keep modules small and focused (< 200 lines ideal)
- Define clear interfaces between modules

### Data Flow Architecture
- Separate pure logic from side effects
- Structure code as: Input → Transform → Output
- Keep I/O operations at the edges

### File Organization
- Group by feature/domain, not by technical layer
- Example: `lib/teams/`, `lib/feishu/`, `skills/rca/`
- Keep related code together

### Function Size
- Keep functions small (< 20 lines ideal)
- Extract complex logic into named helper functions
- Use early returns to reduce nesting

### Avoid Classes with Mutable State
- Prefer modules of pure functions over classes
- Use classes only when you need polymorphism

---

## Test-Driven Development

All coding must follow TDD. Tests are written before implementation.

### Red-Green-Refactor Cycle
1. **Red**: Write a failing test that specifies the desired behavior
2. **Green**: Write the minimum code to make the test pass
3. **Refactor**: Clean up the code while keeping tests green

### Rules
- Never write implementation code without a failing test first
- Write the simplest code that makes the test pass — no more
- Each test covers one behavior or scenario
- Tests must be fast, isolated, and deterministic
- Keep test code as clean as production code

### Test Structure
- Unit tests for pure functions (no mocks needed)
- Integration tests only at I/O boundaries
- Test file mirrors source file: `foo.mjs` → `foo.test.mjs`



---

## Anti-Patterns to Avoid

- ❌ Mutating function arguments or global state
- ❌ Hidden I/O inside pure functions (logging, API calls)
- ❌ Large functions that do multiple things (> 50 lines)
- ❌ Deeply nested conditionals (> 3 levels)
- ❌ Shared mutable state between modules
- ❌ `this.key = val` in fluent builders (breaks immutability)
- ❌ Passing webhook URLs as CLI positional args (bearer token exposure)
- ✅ Return new values instead of mutating
- ✅ Separate computation from effects
- ✅ Small, focused functions with early returns
- ✅ Immutable fluent builders via spread: `{ ...state, key: val }`
