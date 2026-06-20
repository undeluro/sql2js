# sql2js

## Demo

![sql2js TUI Demo](https://github.com/user-attachments/assets/77122469-71af-403a-aa67-e84925394ea2)

## Project Topic

`sql2js` — an SQL-like query language compiler for JSON data, with an interactive TUI and support for a simple relational database model stored in a `.json` file.

## Team

- Dzmitry Nikitsin — dnikitin@student.agh.edu.pl
- Niyaz Lapkouski — nlapkowski@student.agh.edu.pl

## Program Assumptions

The program is a compiler of a simplified SQL-like language for data stored in JSON format. The user can execute queries and modify data through a terminal interface, one-time CLI commands, or `.s2j` script files.

Compilation pipeline:

```text
SQL-like DSL
  -> Lexer ANTLR4
  -> Parser ANTLR4
  -> AST Builder
  -> Semantic Analyzer
  -> JavaScript Code Generator
  -> Runtime Executor
  -> JSON result or modified database
```

## General Program Goals

The program allows:

- executing `SELECT` queries on JSON collections,
- creating collections using the `CREATE COLLECTION` command,
- adding records using the `INSERT` command,
- modifying records using the `UPDATE` command,
- deleting records using the `DELETE` command,
- interactive work in the TUI with automatic saving of changes,
- running commands from the CLI using `-e`,
- running scripts from `.s2j` files using `-f`.

## Type of Translator

Compiler. The program translates the input DSL language to JavaScript code, and then executes the generated function on JSON data.

## Planned Program Output

The output of the program is:

- an array of JSON objects for `SELECT` queries,
- a modified JSON database for `CREATE`, `INSERT`, `UPDATE`, `DELETE` commands,
- error diagnostics with phase distinction: `lexical`, `syntax`, `semantic`, `compiletime`, `runtime`.

## Planned Implementation Language

JavaScript ESM running in Node.js.

## Parser Generator

ANTLR4 is used to implement the scanner and parser:

- grammar: `grammar/JsonQuery.g4`,
- runtime: `antlr4` npm package,
- generated files: `src/generated/`.

After changing the grammar, you should run:

```bash
npm run generate
```

---

## Project Terminology

| Term | Meaning in the project |
|---|---|
| Database | A single `.json` file whose root is an object. |
| Collection / table | A named array of objects in the database, e.g., `"users": [...]`. |
| Record / row | A single JSON object in a collection. |
| Field / column | A property of a record. Nested fields are written as a path, e.g., `profile.score`. |
| Path | Dot notation to object fields, e.g., `address.city`. |
| Statement | A single DSL command ending with a semicolon. |
| Script | An `.s2j` file containing one or more statements. |
| JOIN | Joining records of two collections based on the `ON` condition. |
| UNNEST | Explicit expansion of a nested array in a record to multiple rows. |

Preferred database format:

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

For convenience, a file whose root is an array of objects is still accepted. In this case, the collection name is taken from the file name, e.g., `users.json` is treated as the database `{ "users": [...] }`.

---

## Key Semantic Decisions

| Issue | Decision |
|---|---|
| Database root | A JSON object whose fields are collections. |
| Collection | An array of JSON objects. |
| Navigation through nested objects | Allowed directly: `address.city`. |
| Expanding an object in `SELECT` | `address.*` and `u.address.*` expand the direct fields of the object into columns with a prefix, e.g., `address.city`. |
| Navigation through arrays | Requires an explicit `UNNEST(field) AS alias`. |
| Group aggregates | `COUNT`, `SUM`, `AVG`, `MIN`, `MAX` operate on result rows, with support for `GROUP BY`, `HAVING`, and `COUNT(*)`. |
| Array functions | `ARRAY_COUNT`, `ARRAY_SUM`, `ARRAY_AVG`, `ARRAY_MIN`, `ARRAY_MAX` operate on arrays within a single record. |
| JOIN | `INNER`, `LEFT`, `RIGHT`, `FULL`, and `NATURAL JOIN` between collections. |
| Result of `SELECT *` after JOIN | Technical alias fields are hidden; conflicts from the right side get an alias prefix, e.g., `p.id`. |
| Set operations | `UNION`, `INTERSECT`, `EXCEPT` work without duplicates; final `ORDER BY` and `LIMIT` apply to the entire result. |
| Text matching | `LIKE` is case-sensitive, `ILIKE` is case-insensitive; `%` and `_` are wildcards. |
| Displaying tables in TUI | Nested objects and arrays are shown as full, collapsible JSON text without truncation by ellipsis. |
| Mutations in TUI | After a valid `CREATE`, `INSERT`, `UPDATE`, `DELETE`, changes are automatically saved to the active database. |
| Mutations in CLI | Do not overwrite the input file by default; saving to `-d` requires `--save`. |
| Scripts | `.s2j` files contain statements ending with semicolons. |

---

## Token Description

Tokens are divided into keywords, literals, identifiers, and operators/punctuation marks. Keywords are case-insensitive. Whitespace and `--` line comments are ignored.

### Keywords

| Token | Pattern | Description |
|---|---|---|
| `SELECT` | `[Ss][Ee][Ll][Ee][Cc][Tt]` | Data projection. |
| `FROM` | `[Ff][Rr][Oo][Mm]` | Source collection. |
| `WHERE` | `[Ww][Hh][Ee][Rr][Ee]` | Filtering condition. |
| `GROUP` | `[Gg][Rr][Oo][Uu][Pp]` | Grouping results. |
| `HAVING` | `[Hh][Aa][Vv][Ii][Nn][Gg]` | Condition after group aggregation. |
| `ORDER` | `[Oo][Rr][Dd][Ee][Rr]` | Sorting. |
| `BY` | `[Bb][Yy]` | Part of `ORDER BY`. |
| `LIMIT` | `[Ll][Ii][Mm][Ii][Tt]` | Limit on the number of results. |
| `UNNEST` | `[Uu][Nn][Nn][Ee][Ss][Tt]` | Array expansion. |
| `AS` | `[Aa][Ss]` | Alias. |
| `AND` | `[Aa][Nn][Dd]` | Conjunction. |
| `OR` | `[Oo][Rr]` | Disjunction. |
| `NOT` | `[Nn][Oo][Tt]` | Negation. |
| `ASC` | `[Aa][Ss][Cc]` | Ascending sort. |
| `DESC` | `[Dd][Ee][Ss][Cc]` | Descending sort. |
| `COUNT` | `[Cc][Oo][Uu][Nn][Tt]` | Number of rows or non-null values in a group. |
| `SUM` | `[Ss][Uu][Mm]` | Sum of values in a group. |
| `AVG` | `[Aa][Vv][Gg]` | Average of values in a group. |
| `MIN_F` | `[Mm][Ii][Nn]` | Minimum of values in a group. |
| `MAX_F` | `[Mm][Aa][Xx]` | Maximum of values in a group. |
| `ARRAY_COUNT` | `ARRAY_COUNT` case-insensitive | Number of array elements in a single record. |
| `ARRAY_SUM` | `ARRAY_SUM` case-insensitive | Sum of array elements in a single record. |
| `ARRAY_AVG` | `ARRAY_AVG` case-insensitive | Average of array elements in a single record. |
| `ARRAY_MIN` | `ARRAY_MIN` case-insensitive | Minimum of an array in a single record. |
| `ARRAY_MAX` | `ARRAY_MAX` case-insensitive | Maximum of an array in a single record. |
| `NULL` | `[Nn][Uu][Ll][Ll]` | Null literal. |
| `JOIN` | `[Jj][Oo][Ii][Nn]` | Joining collections. |
| `ON` | `[Oo][Nn]` | JOIN condition. |
| `INNER` | `[Ii][Nn][Nn][Ee][Rr]` | Explicit inner join. |
| `LEFT`, `RIGHT`, `FULL` | case-insensitive | Outer JOIN variants. |
| `OUTER` | `[Oo][Uu][Tt][Ee][Rr]` | Optional word in `LEFT/RIGHT/FULL OUTER JOIN`. |
| `NATURAL` | `[Nn][Aa][Tt][Uu][Rr][Aa][Ll]` | JOIN on common fields. |
| `UNION` | `[Uu][Nn][Ii][Oo][Nn]` | Union of result sets. |
| `INTERSECT` | `[Ii][Nn][Tt][Ee][Rr][Ss][Ee][Cc][Tt]` | Intersection of results. |
| `EXCEPT` | `[Ee][Xx][Cc][Ee][Pp][Tt]` | Difference of results. |
| `LIKE` | `[Ll][Ii][Kk][Ee]` | Case-sensitive pattern matching. |
| `ILIKE` | `[Ii][Ll][Ii][Kk][Ee]` | Case-insensitive pattern matching. |
| `CREATE` | `[Cc][Rr][Ee][Aa][Tt][Ee]` | Creating a collection. |
| `COLLECTION` | `[Cc][Oo][Ll][Ll][Ee][Cc][Tt][Ii][Oo][Nn]` | Collection keyword. |
| `INSERT` | `[Ii][Nn][Ss][Ee][Rr][Tt]` | Adding a record. |
| `INTO` | `[Ii][Nn][Tt][Oo]` | Target collection of INSERT. |
| `VALUE` | `[Vv][Aa][Ll][Uu][Ee]` | Value of the INSERT record. |
| `UPDATE` | `[Uu][Pp][Dd][Aa][Tt][Ee]` | Updating records. |
| `SET` | `[Ss][Ee][Tt]` | List of UPDATE assignments. |
| `DELETE` | `[Dd][Ee][Ll][Ee][Tt][Ee]` | Deleting records. |

### Literals

| Token | Pattern | Examples | Description |
|---|---|---|---|
| `BOOLEAN_LIT` | `true\|false` case-insensitive | `true`, `False` | Boolean value. |
| `INTEGER_LIT` | `[0-9]+` | `0`, `42` | Integer. |
| `FLOAT_LIT` | `[0-9]+'.'[0-9]*` or `'.'[0-9]+` | `3.14`, `.5` | Floating-point number. |
| `STRING_LIT` | `"..."` or `'...'` | `'Ala'`, `"Ola"` | String of characters. |

### Identifiers

| Token | Pattern | Description |
|---|---|---|
| `IDENTIFIER` | `[a-zA-Z_][a-zA-Z_0-9]*` | Name of a collection, field, or alias. |

### Operators and Punctuation Marks

| Token | Lexeme | Description |
|---|---|---|
| `EQ` | `=` | Equality or assignment. |
| `NEQ` | `!=` | Inequality. |
| `LT`, `GT`, `LEQ`, `GEQ` | `<`, `>`, `<=`, `>=` | Comparisons. |
| `PLUS`, `MINUS`, `STAR`, `SLASH` | `+`, `-`, `*`, `/` | Arithmetic operators. |
| `LPAREN`, `RPAREN` | `(`, `)` | Parentheses. |
| `LBRACE`, `RBRACE` | `{`, `}` | Object literal. |
| `LBRACK`, `RBRACK` | `[`, `]` | Array literal. |
| `COMMA` | `,` | Separator. |
| `DOT` | `.` | Path separator. |
| `COLON` | `:` | Key-value separator in an object. |
| `SEMICOLON` | `;` | End of statement. |

---

## Grammar in ANTLR4 Notation

The full grammar file is located in `grammar/JsonQuery.g4`. Below is the most important part of the grammar without semantic actions.

```antlr
program
    : statement+ EOF
    ;

statement
    : queryExpr SEMICOLON
    | createStmt SEMICOLON
    | insertStmt SEMICOLON
    | updateStmt SEMICOLON
    | deleteStmt SEMICOLON
    ;

queryExpr
    : selectCore setTail* orderByClause? limitClause?
    ;

setTail
    : setOp selectCore
    ;

setOp
    : UNION
    | INTERSECT
    | EXCEPT
    ;

selectCore
    : SELECT selectList
      FROM source
      joinClause?
      unnestClause*
      whereClause?
      groupByClause?
      havingClause?
    ;

createStmt
    : CREATE COLLECTION IDENTIFIER FROM arrayLiteral
    ;

insertStmt
    : INSERT INTO IDENTIFIER VALUE objectLiteral
    ;

updateStmt
    : UPDATE IDENTIFIER SET assignment (COMMA assignment)* whereClause?
    ;

deleteStmt
    : DELETE FROM IDENTIFIER whereClause?
    ;

assignment
    : path EQ expr
    ;

selectList
    : STAR
    | selectItem (COMMA selectItem)*
    ;

selectItem
    : path DOT STAR
    | expr (AS IDENTIFIER)?
    ;

source
    : IDENTIFIER (AS IDENTIFIER)?
    ;

joinClause
    : NATURAL? joinType? JOIN IDENTIFIER (AS IDENTIFIER)? (ON expr)?
    ;

joinType
    : INNER
    | LEFT OUTER?
    | RIGHT OUTER?
    | FULL OUTER?
    ;

unnestClause
    : UNNEST LPAREN path RPAREN AS IDENTIFIER
    ;

whereClause
    : WHERE expr
    ;

groupByClause
    : GROUP BY path (COMMA path)*
    ;

havingClause
    : HAVING expr
    ;

orderByClause
    : ORDER BY orderItem (COMMA orderItem)*
    ;

orderItem
    : path direction=(ASC | DESC)?
    ;

limitClause
    : LIMIT INTEGER_LIT
    ;

expr
    : primary
    | MINUS expr
    | expr (STAR | SLASH) expr
    | expr (PLUS | MINUS) expr
    | expr compOp expr
    | NOT expr
    | expr AND expr
    | expr OR expr
    ;

compOp
    : EQ | NEQ | LT | GT | LEQ | GEQ
    | LIKE
    | ILIKE
    | NOT LIKE
    | NOT ILIKE
    ;

primary
    : aggFunc LPAREN aggregateArg RPAREN
    | arrayAggFunc LPAREN path RPAREN
    | path
    | literal
    | objectLiteral
    | arrayLiteral
    | LPAREN expr RPAREN
    ;

aggFunc
    : COUNT | SUM | AVG | MIN_F | MAX_F
    ;

arrayAggFunc
    : ARRAY_COUNT | ARRAY_SUM | ARRAY_AVG | ARRAY_MIN | ARRAY_MAX
    ;

aggregateArg
    : STAR
    | expr
    ;

objectLiteral
    : LBRACE (objectProperty (COMMA objectProperty)*)? RBRACE
    ;

objectProperty
    : objectKey COLON expr
    ;

objectKey
    : IDENTIFIER
    | STRING_LIT
    ;

arrayLiteral
    : LBRACK (expr (COMMA expr)*)? RBRACK
    ;

path
    : IDENTIFIER (DOT IDENTIFIER)*
    ;

literal
    : INTEGER_LIT
    | FLOAT_LIT
    | STRING_LIT
    | BOOLEAN_LIT
    | NULL
    ;
```

Operator priorities in the `expr` rule follow the ANTLR4 left-recursion mechanism: earlier alternatives have higher priority.

---
## Technologies and External Packages Used

| Component | Technology |
|---|---|
| Parser generator | ANTLR4 |
| Parser runtime | `antlr4` |
| Implementation language | JavaScript ESM |
| Runtime | Node.js |
| TUI | Ink + React |
| Terminal colors | chalk |
| File selection in TUI | ink-select-input |
| Large ASCII title | figlet |

---
## Short User Manual

### Requirements

- Node.js >= 18
- Java to generate the ANTLR4 parser

### Installation

```bash
npm install
npm run generate
```

### Interactive TUI Mode

```bash
node src/index.js
node src/index.js -d data/users.json
```

In the TUI, you can select an existing database or create a new one. After valid `CREATE`, `INSERT`, `UPDATE`, `DELETE` statements, changes are automatically saved to the active `.json` file.

Shortcuts in the TUI:

- `Enter` — execute the statement,
- `Shift+Enter` or `Ctrl+J` — insert a new line in the query editor,
- `Left` / `Right` / `Up` / `Down` — move the cursor in the current multi-line statement,
- `Up` / `Down` on the first or last line — statement history,
- `Ctrl+O` — select or change the active database,
- `Ctrl+D` — show or hide the generated JavaScript code,
- `Ctrl+Q` or `Ctrl+C` — quit.

### One-time CLI Mode

```bash
node src/index.js -e "SELECT name, age FROM users WHERE age > 18;" -d data/users.json
```

Mutations from the CLI do not overwrite the input file by default. To save the result back to the database passed via `-d`, you need to add `--save`:

```bash
node src/index.js -e "INSERT INTO users VALUE { id: 99, name: 'Ola' };" -d db.json --save
```

### Running `.s2j` Scripts

`commands.s2j` file:

```sql
CREATE COLLECTION people FROM [{ id: 1, name: 'Ala', age: 20 }];
INSERT INTO people VALUE { id: 2, name: 'Ola', age: 21 };
SELECT name, age FROM people ORDER BY id ASC;
```

Execution:

```bash
node src/index.js -f commands.s2j -d db.json
node src/index.js -f commands.s2j -d db.json --save
```

### Example Usage

```bash
node src/index.js -e "CREATE COLLECTION people FROM [{ id: 1, name: 'Ala', age: 20 }]; INSERT INTO people VALUE { id: 2, name: 'Ola', age: 21 }; SELECT name, age FROM people ORDER BY id ASC;" -d people.json --save
```

Result on standard output:

```json
[
  {
    "name": "Ala",
    "age": 20
  },
  {
    "name": "Ola",
    "age": 21
  }
]
```

### Saving Results

```bash
# Save SELECT result
node src/index.js -e "SELECT name FROM users;" -d db.json -o out/result.json

# Save the entire modified database to a separate file
node src/index.js -f commands.s2j -d db.json --write-dataset out/db-after.json
```

### Debug

```bash
node src/index.js -e "SELECT name FROM users LIMIT 1;" -d data/users.json --debug
node src/index.js -e "SELECT name FROM users LIMIT 1;" -d data/users.json --ex-debug
```

### Help

```bash
node src/index.js --help
```

---

## Examples of Error Diagnostics

```bash
# Lexical error
node src/index.js -e "SELECT name FROM users WHERE age > @;" -d data/users.json

# Lexical error: illegal character in expression
node src/index.js -e "SELECT name FROM users WHERE age # 18;" -d data/users.json

# Syntax error
node src/index.js -e "SELECT name users;" -d data/users.json

# Syntax error: missing semicolon in script file
node src/index.js -f broken-script.s2j -d db.json

# Semantic error
node src/index.js -e "SELECT missingField FROM users;" -d data/users.json

# Semantic error: non-existent collection
node src/index.js -e "SELECT name FROM missing;" -d data/users.json

# Semantic error: INSERT into non-existent collection
node src/index.js -e "INSERT INTO missing VALUE { id: 1 };" -d data/users.json

# Semantic error: UPDATE of a non-existent field with known schema
node src/index.js -e "UPDATE users SET missingField = 1 WHERE id = 1;" -d data/users.json

# Semantic error: UNNEST requires an array
node src/index.js -e "SELECT name FROM users UNNEST(age) AS item;" -d data/users.json

# Semantic error: ARRAY_* function requires an array
node src/index.js -e "SELECT ARRAY_SUM(age) FROM users;" -d data/users.json

# Semantic error: group aggregate cannot be used in WHERE
node src/index.js -e "SELECT name FROM users WHERE COUNT(*) > 1;" -d data/users.json

# Semantic error: regular field in SELECT must appear in GROUP BY
node src/index.js -e "SELECT address.city, name, COUNT(*) FROM users GROUP BY address.city;" -d data/users.json

# Semantic error: JOIN requires an ON condition if not a NATURAL JOIN
node src/index.js -e "SELECT * FROM users JOIN orders;" -d data/users.json -j data/orders.json

# Semantic error: NATURAL JOIN without common top-level fields
node src/index.js -e "SELECT * FROM lefts NATURAL JOIN unrelated;" -d natural.json

# Runtime error
node src/index.js -e "SELECT name FROM users;" -d data

# Runtime error: invalid JSON in the database file
node src/index.js -e "SELECT name FROM users;" -d broken.json

# CLI arguments error: -e and -f are mutually exclusive
node src/index.js -e "SELECT * FROM users;" -f commands.s2j -d data/users.json
```

Example error format:

```text
[syntax] at 1:12: missing FROM at 'users'
  SELECT name users;
              ^
  expected: FROM
  offending text: "users"
```

The distinction between error phases helps pinpoint where the pipeline stopped:

| Phase | What it means | Example |
|---|---|---|
| `lexical` | Lexer cannot recognize a character or token. | `@`, `#` in an expression. |
| `syntax` | Parser received correct tokens but in the wrong order. | `SELECT name users;` |
| `semantic` | Query has correct syntax but violates the schema or language rules. | Unknown collection, bad `UNNEST`, missing `ON` in `JOIN`. |
| `compiletime` | Error during AST building or JavaScript generation. | Unhandled AST node type. |
| `runtime` | Code was generated, but data loading or processing failed. | Directory instead of a `.json` file, broken JSON. |

---
## Supported Statements — Examples

```sql
-- Collection creation
CREATE COLLECTION people FROM [
  { id: 1, name: 'Ala', age: 20 },
  { id: 2, name: 'Ola', age: 21 }
];

-- Adding a record
INSERT INTO people VALUE { id: 3, name: 'Jan', age: 17 };

-- Updating records
UPDATE people
SET age = age + 1
WHERE name = 'Ala';

-- Deleting records
DELETE FROM people
WHERE age < 18;

-- Simple filter with a nested path
SELECT name, address.city FROM users WHERE age > 18 ORDER BY name ASC LIMIT 10;

-- Shallow expansion of address object fields into columns address.city, address.street, etc.
SELECT name, address.* FROM users;

-- Array expansion via UNNEST
SELECT name, tag FROM users UNNEST(tags) AS tag WHERE tag = 'admin';

-- Array function on an array inside a record
SELECT name, ARRAY_COUNT(orders) FROM customers WHERE ARRAY_COUNT(orders) > 3;

-- Row-based group aggregate
SELECT address.city, COUNT(*), AVG(age)
FROM users
GROUP BY address.city
HAVING COUNT(*) > 1;

-- JOIN of two collections
SELECT u.name, o.product, o.total
FROM users AS u
JOIN orders AS o ON u.id = o.userId
WHERE o.total > 100
ORDER BY o.total DESC;

-- LEFT JOIN keeps records from the left collection without a match
SELECT *
FROM users AS u
LEFT JOIN orders AS o ON u.id = o.userId;

-- NATURAL JOIN matches on common top-level fields
SELECT *
FROM lefts NATURAL JOIN rights;

-- Set operations are without duplicates by default
SELECT name FROM users
UNION
SELECT name FROM customers
ORDER BY name
LIMIT 10;

-- LIKE / ILIKE
SELECT name FROM users WHERE name LIKE 'Ali%';
SELECT name FROM users WHERE email ILIKE '%@EXAMPLE.COM';
```

---

## Extended Usage Examples

The following examples show typical scenarios for testing the compiler and runtime. Queries can be run in the TUI or via `-e`, e.g.:

```bash
node src/index.js -e "SELECT name FROM users LIMIT 3;" -d data/users.json
```

### Filtering, Sorting, and Aliases

```sql
-- Projection with column aliases
SELECT name AS userName, age AS userAge
FROM users
WHERE age >= 18
ORDER BY age DESC
LIMIT 5;

-- Condition with AND, OR, NOT and parentheses
SELECT name, age, profile.score
FROM users
WHERE (age > 25 AND profile.active = true) OR NOT address.city = 'Warszawa'
ORDER BY profile.score DESC;

-- Case-sensitive and case-insensitive text comparison
SELECT name FROM users WHERE name LIKE 'Ali%';
SELECT email FROM users WHERE email ILIKE '%@EXAMPLE.COM';
SELECT name FROM users WHERE name NOT ILIKE 'ewa%';
```

### Nested Fields, Arrays, and Aggregates

```sql
-- Direct access to object fields
SELECT name, address.city, profile.active
FROM users
WHERE profile.score >= 80;

-- Array expansion into multiple rows
SELECT name, tag
FROM users
UNNEST(tags) AS tag
WHERE tag = 'developer';

-- Array functions on arrays inside a record
SELECT name, ARRAY_COUNT(orders)
FROM users
WHERE ARRAY_COUNT(orders) > 2;

-- Array functions on an object field within an array
SELECT name, ARRAY_SUM(orders.total), ARRAY_AVG(orders.total), ARRAY_MIN(orders.total), ARRAY_MAX(orders.total)
FROM users
ORDER BY name ASC;

-- Row-based group aggregates
SELECT address.city, COUNT(*), SUM(age), AVG(age), MIN(age), MAX(age)
FROM users
GROUP BY address.city
HAVING COUNT(*) > 1
ORDER BY address.city ASC;

-- Combining both levels: first sum of array in a record, then sum by group
SELECT address.city, SUM(ARRAY_SUM(orders.total))
FROM users
GROUP BY address.city;

-- COUNT(*) counts all rows after WHERE filter
SELECT COUNT(*)
FROM users
WHERE age >= 18;

-- COUNT(field) only counts rows where the field is not null / missing
SELECT COUNT(email), COUNT(profile.score)
FROM users;

-- SUM / AVG / MIN / MAX without GROUP BY return one row for the entire collection
SELECT COUNT(*), SUM(age), AVG(age), MIN(age), MAX(age)
FROM users;

-- Grouping by a single nested field
SELECT address.city, COUNT(*), AVG(age)
FROM users
GROUP BY address.city;

-- Grouping by multiple keys
SELECT address.city, profile.active, COUNT(*), MIN(age), MAX(age)
FROM users
GROUP BY address.city, profile.active
ORDER BY address.city ASC;

-- HAVING filters already aggregated groups, not individual records
SELECT address.city, COUNT(*), AVG(age)
FROM users
GROUP BY address.city
HAVING COUNT(*) >= 2 AND AVG(age) > 25;

-- COUNT(*) can be combined with COUNT(field) to detect missing values
SELECT address.city, COUNT(*), COUNT(email)
FROM users
GROUP BY address.city
HAVING COUNT(*) > COUNT(email);

-- ARRAY_COUNT works on an array within a single record
SELECT name, ARRAY_COUNT(tags), ARRAY_COUNT(orders)
FROM users
WHERE ARRAY_COUNT(tags) > 0;

-- ARRAY_SUM / ARRAY_AVG / ARRAY_MIN / ARRAY_MAX on an array of numbers
CREATE COLLECTION metrics FROM [
  { id: 1, scores: [10, 20, 30] },
  { id: 2, scores: [5, 15] },
  { id: 3, scores: [] }
];

SELECT id, ARRAY_SUM(scores), ARRAY_AVG(scores), ARRAY_MIN(scores), ARRAY_MAX(scores)
FROM metrics;

-- ARRAY_* on an object field within an array, e.g., orders.total
SELECT name,
       ARRAY_SUM(orders.total),
       ARRAY_AVG(orders.total),
       ARRAY_MIN(orders.total),
       ARRAY_MAX(orders.total)
FROM users;

-- Group aggregation over values calculated from arrays in records
SELECT address.city,
       COUNT(*),
       SUM(ARRAY_SUM(orders.total)),
       AVG(ARRAY_COUNT(orders)),
       MAX(ARRAY_MAX(orders.total))
FROM users
GROUP BY address.city
HAVING SUM(ARRAY_SUM(orders.total)) > 100;

-- JOIN + aggregation: sum of orders and number of orders per user
SELECT u.name, COUNT(*), SUM(o.total), AVG(o.total), MIN(o.total), MAX(o.total)
FROM users AS u
JOIN orders AS o ON u.id = o.userId
GROUP BY u.name
HAVING SUM(o.total) > 100;

-- UNNEST + aggregation: most frequently occurring tags
SELECT tag, COUNT(*)
FROM users
UNNEST(tags) AS tag
GROUP BY tag
HAVING COUNT(*) > 1
ORDER BY tag ASC;

-- Incorrect: group aggregates do not work in WHERE, HAVING is for that
SELECT address.city, COUNT(*)
FROM users
WHERE COUNT(*) > 1
GROUP BY address.city;

-- Incorrect: a field outside an aggregate must be in GROUP BY
SELECT address.city, name, COUNT(*)
FROM users
GROUP BY address.city;

-- Incorrect: ARRAY_SUM requires an array, not a regular number
SELECT ARRAY_SUM(age)
FROM users;
```

### Data Mutations

```sql
-- Creating a new collection
CREATE COLLECTION tasks FROM [
  { id: 1, title: 'Parser', done: false },
  { id: 2, title: 'Codegen', done: false }
];

-- Adding a record
INSERT INTO tasks VALUE { id: 3, title: 'Tests', done: false };

-- Updating one or multiple records
UPDATE tasks
SET done = true
WHERE title = 'Parser';

-- Updating a nested field
UPDATE users
SET profile.score = profile.score + 1
WHERE profile.active = true;

-- Deleting records that match a condition
DELETE FROM tasks
WHERE done = true;
```

In the TUI, mutations are automatically saved to the active database. In CLI mode, `--save` must be added if the result is to overwrite the file from `-d`:

```bash
node src/index.js -e "INSERT INTO users VALUE { id: 99, name: 'Test', age: 20 };" -d data/users.json --save
```

### JOIN of Different Types

For examples with a separate orders file, you can use:

```bash
node src/index.js -e "SELECT u.name, o.product FROM users AS u JOIN orders AS o ON u.id = o.userId;" -d data/users.json -j data/orders.json
```

```sql
-- Default JOIN acts like INNER JOIN
SELECT u.name, o.product, o.total
FROM users AS u
JOIN orders AS o ON u.id = o.userId;

-- Explicit INNER JOIN
SELECT u.name, o.product
FROM users AS u
INNER JOIN orders AS o ON u.id = o.userId
WHERE o.total > 1000;

-- LEFT JOIN keeps all users from the left side
SELECT u.name, o.product
FROM users AS u
LEFT JOIN orders AS o ON u.id = o.userId;

-- RIGHT JOIN keeps all records from the right side
SELECT u.name, o.product
FROM users AS u
RIGHT JOIN orders AS o ON u.id = o.userId;

-- FULL JOIN keeps unmatched records from both sides
SELECT u.name, o.product
FROM users AS u
FULL JOIN orders AS o ON u.id = o.userId;

-- SELECT * after JOIN hides technical alias fields
-- Name conflicts from the right side get an alias prefix, e.g., o.id
SELECT *
FROM users AS u
LEFT OUTER JOIN orders AS o ON u.id = o.userId;

-- Fields from the right side can be accessed via alias
SELECT u.name, o.status, o.total
FROM users AS u
JOIN orders AS o ON u.id = o.userId;

-- Unique, non-conflicting fields from the right side can be used without an alias
SELECT name, product, total
FROM users AS u
JOIN orders AS o ON u.id = o.userId;
```

### NATURAL JOIN

`NATURAL JOIN` matches records based on common top-level fields. Example database:

```json
{
  "lefts": [
    { "id": 1, "code": "x", "leftValue": "L1" },
    { "id": 2, "code": "y", "leftValue": "L2" }
  ],
  "rights": [
    { "id": 1, "code": "x", "rightValue": "R1" },
    { "id": 2, "code": "z", "rightValue": "R2" }
  ]
}
```

```sql
-- Match on common id and code fields
SELECT *
FROM lefts NATURAL JOIN rights;

-- Outer variants are also supported
SELECT leftValue, rightValue
FROM lefts NATURAL LEFT JOIN rights;

SELECT leftValue, rightValue
FROM lefts NATURAL FULL JOIN rights;
```

### Set Operations and Result Uniqueness

The project does not have a separate `UNIQUE` keyword. Operations `UNION`, `INTERSECT`, and `EXCEPT` act as set operations, meaning they remove duplicate rows based on JSON values.

```sql
-- UNION: sum of results without duplicates
SELECT name FROM users
UNION
SELECT name FROM customers
ORDER BY name;

-- INTERSECT: only common rows
SELECT name FROM users
INTERSECT
SELECT name FROM customers;

-- EXCEPT: rows from the left side that are not on the right
SELECT name FROM users
EXCEPT
SELECT name FROM customers
ORDER BY name
LIMIT 10;

-- Duplicates are removed for entire result objects
SELECT name, age FROM users
UNION
SELECT name, age FROM users;
```

### `.s2j` Scripts

The `commands.s2j` file can contain multiple statements executed in sequence:

```sql
CREATE COLLECTION people FROM [{ id: 1, name: 'Ala', age: 20 }];
INSERT INTO people VALUE { id: 2, name: 'Ola', age: 21 };
UPDATE people SET age = age + 1 WHERE id = 2;
SELECT name, age FROM people ORDER BY id ASC;
```

Running with saving changes:

```bash
node src/index.js -f commands.s2j -d db.json --save
```
---
## Testing

```bash
node src/test.js
```

The tests cover, among other things:

- parsing `SELECT`, `CREATE`, `INSERT`, `UPDATE`, `DELETE`,
- validation of JSON database shape,
- executing mutations and queries,
- running `.s2j` scripts,
- saving via `--save`, `--output`, `--write-dataset`,
- regression for `JOIN` variants, `NATURAL JOIN`, set operations, `LIKE`/`ILIKE`, `UNNEST`, `ARRAY_*` functions, group aggregates, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT`,
- expanding `path.*`, full display of nested values in tables, and multi-line editor in the TUI.
---

## Implementation Notes

- The project does not use JSX or a bundler.
- The TUI interface is written using `React.createElement`.
- Generated ANTLR files in `src/generated/` are ignored by Git.
- After switching commits or changing the grammar, you must run `npm run generate` to keep the parser up to date with the current grammar.
