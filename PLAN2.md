# Recovery Plan: Make the JSON Query Translator Defensible and Useful

## Summary

The project should be repositioned from a small `SELECT` demo into a JSON-backed relational-style DSL. The key upgrade is to define a strict supported JSON data model, validate input JSON before query execution, extend the grammar with data creation and mutation statements, and add real JSON output saving.

The intended end state:

- The program clearly documents which JSON shapes are supported and rejects unsupported JSON early.
- `SELECT` works only against validated relational-like JSON collections.
- The language supports `CREATE`, `INSERT`, `UPDATE`, `DELETE`, and `SELECT`.
- The CLI can save query results or modified datasets to JSON files.
- Error messages explain whether a problem is lexical, syntax, semantic, compiletime, or runtime.

## Key Design Decisions

### Supported JSON Model

Accept only JSON that can be mapped to relational collections:

- Valid root shape 1: top-level array of objects.

```json
[
  { "id": 1, "name": "Ala" },
  { "id": 2, "name": "Ola" }
]
```

This is treated as one collection. Its collection name is inferred from the input file name, e.g. `users.json` becomes collection `users`.

- Valid root shape 2: top-level object whose values include at least one array of objects.

```json
{
  "users": [
    { "id": 1, "name": "Ala" }
  ],
  "orders": [
    { "id": 10, "userId": 1, "total": 100 }
  ]
}
```

Each array-of-objects property is treated as a collection.

- Nested objects inside records are allowed.
- Nested arrays inside records are allowed only when accessed through `UNNEST`.
- Invalid JSON shapes:
  - primitive root: `123`, `"abc"`, `true`, `null`;
  - array of primitives: `[1, 2, 3]`;
  - mixed array: `[{"id": 1}, 2]`;
  - object without any array-of-objects collection: `{ "name": "Ala" }`.

### Query Language Scope

Add these statement types:

```sql
CREATE COLLECTION users FROM [
  { id: 1, name: 'Ala', age: 20 }
];

INSERT INTO users VALUE { id: 2, name: 'Ola', age: 21 };

UPDATE users
SET age = age + 1
WHERE name = 'Ala';

DELETE FROM users
WHERE age < 18;

SELECT name, age FROM users WHERE age >= 18;
```

For simplicity and demo value:

- `CREATE COLLECTION ... FROM [...]` creates a collection with initial data, not an empty schema-only table.
- `INSERT` inserts one object at a time.
- `UPDATE` supports assignments to existing fields and nested paths.
- `DELETE` removes records matching `WHERE`.
- Multiple statements in one input are supported and executed sequentially.

## Implementation Changes

### Validation and Schema Inference

Add a new dataset validation layer before semantic analysis:

- Load JSON from file.
- Validate root shape against the supported JSON model.
- Infer collections and field schemas:
  - scalar fields: `string`, `number`, `boolean`, `null`;
  - nested objects;
  - arrays of scalars;
  - arrays of objects;
  - nullable fields when values are missing or `null`.
- Reject unsupported datasets with semantic/runtime-level diagnostics before query execution.

This requires reorganizing the pipeline:

1. Lex + parse query.
2. Build AST.
3. Load JSON.
4. Validate JSON and infer schema.
5. Run semantic analysis using the inferred schema.
6. Generate JavaScript.
7. Execute.
8. Optionally write result JSON.

### Grammar and AST

Extend the ANTLR grammar with:

- `statement`: `selectStmt | createStmt | insertStmt | updateStmt | deleteStmt`;
- JSON literals: object literals and array literals;
- assignment expressions for `UPDATE`;
- statement-level AST nodes:
  - `CreateCollectionNode`;
  - `InsertNode`;
  - `UpdateNode`;
  - `DeleteNode`;
  - existing `QueryNode` for `SELECT`.

Keep existing expression syntax for `WHERE`, arithmetic, comparisons, logical operators, paths, aggregates, and literals.

### Execution and Code Generation

Extend code generation so every statement compiles to JavaScript:

- `SELECT` returns a result array.
- `CREATE` creates or replaces a collection in the in-memory dataset.
- `INSERT` appends a record to a collection.
- `UPDATE` maps records and updates matching ones.
- `DELETE` filters records out of a collection.
- Multi-statement programs execute in order and return:
  - the final `SELECT` result if the last statement is `SELECT`;
  - otherwise the modified dataset.

For safety:

- Input files are not overwritten by default.
- Mutating statements modify only the in-memory dataset unless an output flag is provided.

### CLI Output

Add explicit output support:

```bash
node src/index.js -e "SELECT name FROM users;" -d data/users.json -o out/result.json
```

Add flags:

- `-o, --output <file>`: save final result as pretty JSON.
- `--write-dataset <file>`: save the full modified dataset after `CREATE`, `INSERT`, `UPDATE`, or `DELETE`.
- Keep console JSON output as the default for one-shot mode.

Output behavior:

- For `SELECT`, `--output` writes selected rows.
- For DML/DDL statements, `--write-dataset` writes the modified dataset.
- If neither flag is provided, print JSON to console.

## Test Plan

Add tests for supported JSON validation:

- accepts top-level array of objects;
- accepts top-level object with collection arrays;
- rejects `[1, 2, 3]`;
- rejects mixed arrays;
- rejects object with no array-of-objects collection;
- rejects non-`.json` file paths and directories.

Add grammar/parser tests:

- parses `CREATE COLLECTION`;
- parses `INSERT INTO ... VALUE`;
- parses `UPDATE ... SET ... WHERE`;
- parses `DELETE FROM ... WHERE`;
- still parses existing `SELECT`, `JOIN`, `UNNEST`, `ORDER BY`, `LIMIT`.

Add semantic tests:

- rejects `FROM` collection that does not exist;
- rejects insert into unknown collection;
- rejects update/delete from unknown collection;
- rejects invalid paths based on inferred schema;
- rejects unsupported operations on arrays without `UNNEST`.

Add execution tests:

- `CREATE` creates a collection from object literals;
- `INSERT` appends a record;
- `UPDATE` changes only matching records;
- `DELETE` removes only matching records;
- `SELECT` after mutations sees updated data;
- `--output` writes selected results;
- `--write-dataset` writes modified dataset.

## Assumptions and Defaults

- The project remains a JavaScript/ANTLR4 compiler-style project.
- We keep JavaScript code generation instead of replacing execution with a direct interpreter.
- Empty schema-only `CREATE TABLE` is out of scope; `CREATE COLLECTION` must include initial JSON objects.
- Root arrays of objects are supported for convenience, with collection name inferred from the file name.
- The primary defended model is relational-like JSON: collections are arrays of objects.
- Mutating operations never overwrite input files unless a dedicated output path is provided.
