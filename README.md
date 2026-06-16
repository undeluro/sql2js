# sql2js

`sql2js` is a small relational-style database system for JSON files. It compiles an SQL-like DSL to JavaScript, runs it against JSON collections, and can be used from an interactive terminal UI, inline CLI commands, or `.s2j` script files.

## Terminology

| Term | Meaning in sql2js |
|---|---|
| Database | One `.json` file whose root is an object. |
| Collection / table | A named array of records under the database root, for example `"users": [...]`. |
| Record / row | One JSON object inside a collection. |
| Field / column | A property on a record. Nested object fields use dot paths like `profile.score`. |
| Statement | One DSL command ending with `;`. |
| Script | A `.s2j` file containing one or more statements. |
| Join | A relational pairing of records from two collections with `JOIN ... ON ...`. |
| UNNEST | Explicit expansion of a nested array field into rows. |

The preferred database shape is:

```json
{
  "users": [
    { "id": 1, "name": "Ala", "age": 20 }
  ],
  "orders": [
    { "id": 10, "userId": 1, "total": 100 }
  ]
}
```

For compatibility, a top-level array of objects is accepted and treated as one collection named after the file. For example `users.json` containing `[{ "id": 1 }]` is treated as database `{ "users": [{ "id": 1 }] }`.

## Supported Language

```sql
CREATE COLLECTION people FROM [
  { id: 1, name: 'Ala', age: 20 }
];

INSERT INTO people VALUE { id: 2, name: 'Ola', age: 21 };

UPDATE people
SET age = age + 1
WHERE name = 'Ala';

DELETE FROM people
WHERE age < 18;

SELECT name, age
FROM people
WHERE age >= 18
ORDER BY age DESC
LIMIT 10;
```

Queries support:

- `SELECT`, `WHERE`, `ORDER BY`, `LIMIT`
- `JOIN <collection> AS <alias> ON <condition>`
- `UNNEST(path) AS alias` for nested arrays
- nested paths such as `address.city`
- aggregates on arrays: `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`
- multiple semicolon-terminated statements executed sequentially

## Usage

Install dependencies and generate the ANTLR parser:

```bash
npm install
npm run generate
```

Run the TUI:

```bash
node src/index.js
node src/index.js -d data/users.json
```

In the TUI:

- choose an existing `.json` database or create a new one;
- run `SELECT`, `CREATE COLLECTION`, `INSERT`, `UPDATE`, and `DELETE`;
- successful mutations are saved back to the active database file automatically;
- `Up` / `Down` navigate history;
- `Left` / `Right` move the cursor inside the current statement;
- `Ctrl+Q` or `Ctrl+C` exits.

Run an inline command:

```bash
node src/index.js -e "SELECT name FROM users WHERE age > 18;" -d data/users.json
```

Run a `.s2j` script file:

```bash
node src/index.js -f scripts/seed.s2j -d db.json
```

Persist CLI mutations back to the active database:

```bash
node src/index.js -f scripts/seed.s2j -d db.json --save
```

Write outputs explicitly:

```bash
node src/index.js -e "SELECT name FROM users;" -d db.json -o out/result.json
node src/index.js -f scripts/update.s2j -d db.json --write-dataset out/db-after.json
```

Debug compiler output:

```bash
node src/index.js -e "SELECT name FROM users LIMIT 1;" -d data/users.json --debug
node src/index.js -e "SELECT name FROM users LIMIT 1;" -d data/users.json --ex-debug
```

## Compiler Pipeline

```text
DSL statements
  -> ANTLR lexer
  -> ANTLR parser
  -> AST builder
  -> semantic analyzer with inferred database schema
  -> JavaScript code generator
  -> runtime executor
  -> result rows or modified database
```

The compiler reports errors by phase:

- `lexical`
- `syntax`
- `semantic`
- `compiletime`
- `runtime`

Example:

```text
[syntax] at 1:12: missing FROM at 'users'
  SELECT name users;
              ^
  expected: FROM
  offending text: "users"
```

## Development

Useful commands:

```bash
npm run generate
node src/test.js
node src/index.js --help
```

Important project rules:

- The project uses JavaScript ESM and Node.js 18+.
- The grammar lives in `grammar/JsonQuery.g4`.
- Generated ANTLR files live in `src/generated/` and are ignored by Git.
- Run `npm run generate` after changing the grammar or switching commits with different grammar versions.
- The TUI uses Ink with `React.createElement`; there is no JSX build step.

## Team

- Dzmitry Nikitsin — dnikitin@student.agh.edu.pl
- Niyaz Lapkouski — nlapkowski@student.agh.edu.pl
