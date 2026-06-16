# json-query-2-javascript

## Temat projektu

`sql2js` — kompilator języka zapytań SQL-like dla danych JSON, z interaktywnym TUI oraz obsługą prostego modelu relacyjnej bazy danych zapisanej w pliku `.json`.

## Zespół

- Dzmitry Nikitsin — dnikitin@student.agh.edu.pl
- Niyaz Lapkouski — nlapkowski@student.agh.edu.pl

## Założenia programu

Program jest kompilatorem uproszczonego języka SQL-like dla danych zapisanych w formacie JSON. Użytkownik może wykonywać zapytania oraz modyfikacje danych przez interfejs terminalowy, jednorazowe polecenia CLI albo pliki skryptów `.s2j`.

Pipeline kompilacji:

```text
SQL-like DSL
  -> Lexer ANTLR4
  -> Parser ANTLR4
  -> AST Builder
  -> Semantic Analyzer
  -> Code Generator JavaScript
  -> Runtime Executor
  -> wynik JSON albo zmodyfikowana baza danych
```

## Ogólne cele programu

Program umożliwia:

- wykonywanie zapytań `SELECT` na kolekcjach JSON,
- tworzenie kolekcji poleceniem `CREATE COLLECTION`,
- dodawanie rekordów poleceniem `INSERT`,
- modyfikowanie rekordów poleceniem `UPDATE`,
- usuwanie rekordów poleceniem `DELETE`,
- pracę interaktywną w TUI z automatycznym zapisem zmian,
- uruchamianie poleceń z CLI przez `-e`,
- uruchamianie skryptów z plików `.s2j` przez `-f`.

## Rodzaj translatora

Kompilator. Program tłumaczy wejściowy język DSL do kodu JavaScript, a następnie wykonuje wygenerowaną funkcję na danych JSON.

## Planowany wynik działania programu

Wynikiem działania jest:

- tablica obiektów JSON dla zapytań `SELECT`,
- zmodyfikowana baza danych JSON dla poleceń `CREATE`, `INSERT`, `UPDATE`, `DELETE`,
- diagnostyka błędów z rozróżnieniem faz: `lexical`, `syntax`, `semantic`, `compiletime`, `runtime`.

## Planowany język implementacji

JavaScript ESM uruchamiany w Node.js.

## Generator parsera

Do realizacji skanera i parsera używany jest ANTLR4:

- gramatyka: `grammar/JsonQuery.g4`,
- runtime: pakiet npm `antlr4`,
- wygenerowane pliki: `src/generated/`.

Po zmianie gramatyki należy uruchomić:

```bash
npm run generate
```

---

## Terminologia projektu

| Termin | Znaczenie w projekcie |
|---|---|
| Baza danych | Jeden plik `.json`, którego korzeniem jest obiekt. |
| Kolekcja / tabela | Nazwana tablica obiektów w bazie danych, np. `"users": [...]`. |
| Rekord / wiersz | Pojedynczy obiekt JSON w kolekcji. |
| Pole / kolumna | Właściwość rekordu. Pola zagnieżdżone zapisuje się ścieżką, np. `profile.score`. |
| Ścieżka | Notacja kropkowa do pól obiektu, np. `address.city`. |
| Instrukcja | Pojedyncze polecenie DSL zakończone średnikiem. |
| Skrypt | Plik `.s2j` zawierający jedną lub wiele instrukcji. |
| JOIN | Łączenie rekordów dwóch kolekcji na podstawie warunku `ON`. |
| UNNEST | Jawne rozwinięcie tablicy zagnieżdżonej w rekordzie do wielu wierszy. |

Preferowany format bazy danych:

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

Dla wygody nadal akceptowany jest plik, którego korzeniem jest tablica obiektów. Wtedy nazwa kolekcji jest brana z nazwy pliku, np. `users.json` jest traktowany jak baza `{ "users": [...] }`.

---

## Kluczowe decyzje semantyczne

| Kwestia | Decyzja |
|---|---|
| Korzeń bazy danych | Obiekt JSON, którego pola są kolekcjami. |
| Kolekcja | Tablica obiektów JSON. |
| Nawigacja przez zagnieżdżone obiekty | Dozwolona bezpośrednio: `address.city`. |
| Nawigacja przez tablice | Wymaga jawnego `UNNEST(pole) AS alias`. |
| Agregaty | `COUNT`, `SUM`, `AVG`, `MIN`, `MAX` operują na tablicach wewnątrz rekordu. |
| JOIN | Prosty `JOIN ... ON` między dwiema kolekcjami. |
| Mutacje w TUI | Po poprawnym `CREATE`, `INSERT`, `UPDATE`, `DELETE` zmiany są automatycznie zapisywane do aktywnej bazy. |
| Mutacje w CLI | Domyślnie nie nadpisują pliku wejściowego; zapis do `-d` wymaga `--save`. |
| Skrypty | Pliki `.s2j` zawierają instrukcje zakończone średnikami. |

---

## Wspierane instrukcje — przykłady

```sql
-- Utworzenie kolekcji
CREATE COLLECTION people FROM [
  { id: 1, name: 'Ala', age: 20 },
  { id: 2, name: 'Ola', age: 21 }
];

-- Dodanie rekordu
INSERT INTO people VALUE { id: 3, name: 'Jan', age: 17 };

-- Aktualizacja rekordów
UPDATE people
SET age = age + 1
WHERE name = 'Ala';

-- Usunięcie rekordów
DELETE FROM people
WHERE age < 18;

-- Prosty filtr z zagnieżdżoną ścieżką
SELECT name, address.city FROM users WHERE age > 18 ORDER BY name ASC LIMIT 10;

-- Rozwinięcie tablicy przez UNNEST
SELECT name, tag FROM users UNNEST(tags) AS tag WHERE tag = 'admin';

-- Agregat na tablicy wewnątrz rekordu
SELECT name, COUNT(orders) FROM customers WHERE COUNT(orders) > 3;

-- JOIN dwóch kolekcji
SELECT u.name, o.product, o.total
FROM users AS u
JOIN orders AS o ON u.id = o.userId
WHERE o.total > 100
ORDER BY o.total DESC;
```

---

## Opis tokenów

Tokeny są podzielone na słowa kluczowe, literały, identyfikatory oraz operatory/znaki przestankowe. Słowa kluczowe są case-insensitive. Białe znaki i komentarze liniowe `--` są pomijane.

### Słowa kluczowe

| Token | Wzorzec | Opis |
|---|---|---|
| `SELECT` | `[Ss][Ee][Ll][Ee][Cc][Tt]` | Projekcja danych. |
| `FROM` | `[Ff][Rr][Oo][Mm]` | Źródłowa kolekcja. |
| `WHERE` | `[Ww][Hh][Ee][Rr][Ee]` | Warunek filtrowania. |
| `ORDER` | `[Oo][Rr][Dd][Ee][Rr]` | Sortowanie. |
| `BY` | `[Bb][Yy]` | Część `ORDER BY`. |
| `LIMIT` | `[Ll][Ii][Mm][Ii][Tt]` | Ograniczenie liczby wyników. |
| `UNNEST` | `[Uu][Nn][Nn][Ee][Ss][Tt]` | Rozwinięcie tablicy. |
| `AS` | `[Aa][Ss]` | Alias. |
| `AND` | `[Aa][Nn][Dd]` | Koniunkcja. |
| `OR` | `[Oo][Rr]` | Alternatywa. |
| `NOT` | `[Nn][Oo][Tt]` | Negacja. |
| `ASC` | `[Aa][Ss][Cc]` | Sortowanie rosnące. |
| `DESC` | `[Dd][Ee][Ss][Cc]` | Sortowanie malejące. |
| `COUNT` | `[Cc][Oo][Uu][Nn][Tt]` | Liczba elementów tablicy. |
| `SUM` | `[Ss][Uu][Mm]` | Suma elementów tablicy. |
| `AVG` | `[Aa][Vv][Gg]` | Średnia elementów tablicy. |
| `MIN_F` | `[Mm][Ii][Nn]` | Minimum tablicy. |
| `MAX_F` | `[Mm][Aa][Xx]` | Maksimum tablicy. |
| `NULL` | `[Nn][Uu][Ll][Ll]` | Literał null. |
| `JOIN` | `[Jj][Oo][Ii][Nn]` | Łączenie kolekcji. |
| `ON` | `[Oo][Nn]` | Warunek JOIN. |
| `CREATE` | `[Cc][Rr][Ee][Aa][Tt][Ee]` | Tworzenie kolekcji. |
| `COLLECTION` | `[Cc][Oo][Ll][Ll][Ee][Cc][Tt][Ii][Oo][Nn]` | Słowo kluczowe kolekcji. |
| `INSERT` | `[Ii][Nn][Ss][Ee][Rr][Tt]` | Dodanie rekordu. |
| `INTO` | `[Ii][Nn][Tt][Oo]` | Docelowa kolekcja INSERT. |
| `VALUE` | `[Vv][Aa][Ll][Uu][Ee]` | Wartość rekordu INSERT. |
| `UPDATE` | `[Uu][Pp][Dd][Aa][Tt][Ee]` | Aktualizacja rekordów. |
| `SET` | `[Ss][Ee][Tt]` | Lista przypisań UPDATE. |
| `DELETE` | `[Dd][Ee][Ll][Ee][Tt][Ee]` | Usunięcie rekordów. |

### Literały

| Token | Wzorzec | Przykłady | Opis |
|---|---|---|---|
| `BOOLEAN_LIT` | `true\|false` case-insensitive | `true`, `False` | Wartość logiczna. |
| `INTEGER_LIT` | `[0-9]+` | `0`, `42` | Liczba całkowita. |
| `FLOAT_LIT` | `[0-9]+'.'[0-9]*` lub `'.'[0-9]+` | `3.14`, `.5` | Liczba zmiennoprzecinkowa. |
| `STRING_LIT` | `"..."` albo `'...'` | `'Ala'`, `"Ola"` | Łańcuch znaków. |

### Identyfikatory

| Token | Wzorzec | Opis |
|---|---|---|
| `IDENTIFIER` | `[a-zA-Z_][a-zA-Z_0-9]*` | Nazwa kolekcji, pola lub aliasu. |

### Operatory i znaki przestankowe

| Token | Leksem | Opis |
|---|---|---|
| `EQ` | `=` | Równość albo przypisanie. |
| `NEQ` | `!=` | Nierówność. |
| `LT`, `GT`, `LEQ`, `GEQ` | `<`, `>`, `<=`, `>=` | Porównania. |
| `PLUS`, `MINUS`, `STAR`, `SLASH` | `+`, `-`, `*`, `/` | Operatory arytmetyczne. |
| `LPAREN`, `RPAREN` | `(`, `)` | Nawiasy okrągłe. |
| `LBRACE`, `RBRACE` | `{`, `}` | Literał obiektu. |
| `LBRACK`, `RBRACK` | `[`, `]` | Literał tablicy. |
| `COMMA` | `,` | Separator. |
| `DOT` | `.` | Separator ścieżki. |
| `COLON` | `:` | Separator klucza i wartości w obiekcie. |
| `SEMICOLON` | `;` | Koniec instrukcji. |

---

## Gramatyka w notacji ANTLR4

Pełny plik gramatyki znajduje się w `grammar/JsonQuery.g4`. Poniżej najważniejsza część gramatyki bez akcji semantycznych.

```antlr
program
    : statement+ EOF
    ;

statement
    : selectStmt SEMICOLON
    | createStmt SEMICOLON
    | insertStmt SEMICOLON
    | updateStmt SEMICOLON
    | deleteStmt SEMICOLON
    ;

selectStmt
    : SELECT selectList
      FROM source
      joinClause?
      unnestClause*
      whereClause?
      orderByClause?
      limitClause?
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
    : expr (AS IDENTIFIER)?
    ;

source
    : IDENTIFIER (AS IDENTIFIER)?
    ;

joinClause
    : JOIN IDENTIFIER (AS IDENTIFIER)? ON expr
    ;

unnestClause
    : UNNEST LPAREN path RPAREN AS IDENTIFIER
    ;

whereClause
    : WHERE expr
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

primary
    : aggFunc LPAREN path RPAREN
    | path
    | literal
    | objectLiteral
    | arrayLiteral
    | LPAREN expr RPAREN
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

Priorytety operatorów w regule `expr` są zgodne z mechanizmem lewostronnej rekurencji ANTLR4: wcześniejsze alternatywy mają wyższy priorytet.

---

## Krótka instrukcja obsługi

### Wymagania

- Node.js >= 18
- Java do generowania parsera ANTLR4

### Instalacja

```bash
npm install
npm run generate
```

### Tryb interaktywny TUI

```bash
node src/index.js
node src/index.js -d data/users.json
```

W TUI można wybrać istniejącą bazę lub utworzyć nową. Po poprawnych instrukcjach `CREATE`, `INSERT`, `UPDATE`, `DELETE` zmiany są automatycznie zapisywane do aktywnego pliku `.json`.

Skróty w TUI:

- `Enter` — wykonanie instrukcji,
- `Left` / `Right` — przesuwanie kursora w aktualnej instrukcji,
- `Up` / `Down` — historia instrukcji,
- `Ctrl+Q` albo `Ctrl+C` — wyjście.

### Tryb jednorazowy CLI

```bash
node src/index.js -e "SELECT name, age FROM users WHERE age > 18;" -d data/users.json
```

Mutacje z CLI domyślnie nie nadpisują pliku wejściowego. Aby zapisać wynik z powrotem do bazy przekazanej przez `-d`, należy dodać `--save`:

```bash
node src/index.js -e "INSERT INTO users VALUE { id: 99, name: 'Ola' };" -d db.json --save
```

### Uruchamianie skryptów `.s2j`

Plik `commands.s2j`:

```sql
CREATE COLLECTION people FROM [{ id: 1, name: 'Ala', age: 20 }];
INSERT INTO people VALUE { id: 2, name: 'Ola', age: 21 };
SELECT name, age FROM people ORDER BY id ASC;
```

Uruchomienie:

```bash
node src/index.js -f commands.s2j -d db.json
node src/index.js -f commands.s2j -d db.json --save
```

### Przykład użycia

```bash
node src/index.js -e "CREATE COLLECTION people FROM [{ id: 1, name: 'Ala', age: 20 }]; INSERT INTO people VALUE { id: 2, name: 'Ola', age: 21 }; SELECT name, age FROM people ORDER BY id ASC;" -d people.json --save
```

Wynik na standardowym wyjściu:

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

### Zapisywanie wyników

```bash
# Zapis wyniku SELECT
node src/index.js -e "SELECT name FROM users;" -d db.json -o out/result.json

# Zapis całej zmodyfikowanej bazy do osobnego pliku
node src/index.js -f commands.s2j -d db.json --write-dataset out/db-after.json
```

### Debug

```bash
node src/index.js -e "SELECT name FROM users LIMIT 1;" -d data/users.json --debug
node src/index.js -e "SELECT name FROM users LIMIT 1;" -d data/users.json --ex-debug
```

### Pomoc

```bash
node src/index.js --help
```

---

## Przykłady diagnostyki błędów

```bash
# Błąd leksykalny
node src/index.js -e "SELECT name FROM users WHERE age > @;" -d data/users.json

# Błąd składniowy
node src/index.js -e "SELECT name users;" -d data/users.json

# Błąd semantyczny
node src/index.js -e "SELECT missingField FROM users;" -d data/users.json

# Błąd runtime
node src/index.js -e "SELECT name FROM users;" -d data
```

Przykładowy format błędu:

```text
[syntax] at 1:12: missing FROM at 'users'
  SELECT name users;
              ^
  expected: FROM
  offending text: "users"
```

---

## Testowanie

```bash
node src/test.js
```

Testy obejmują między innymi:

- parsowanie `SELECT`, `CREATE`, `INSERT`, `UPDATE`, `DELETE`,
- walidację kształtu bazy JSON,
- wykonanie mutacji i zapytań,
- uruchamianie skryptów `.s2j`,
- zapis przez `--save`, `--output`, `--write-dataset`,
- regresję dla `JOIN`, `UNNEST`, agregatów, `ORDER BY`, `LIMIT`.

---

## Użyte technologie i pakiety zewnętrzne

| Komponent | Technologia |
|---|---|
| Generator parsera | ANTLR4 |
| Runtime parsera | `antlr4` |
| Język implementacji | JavaScript ESM |
| Runtime | Node.js |
| TUI | Ink + React |
| Kolory terminala | chalk |
| Wybór pliku w TUI | ink-select-input |
| Duży tytuł ASCII | figlet |

---

## Uwagi implementacyjne

- Projekt nie używa JSX ani bundlera.
- Interfejs TUI jest napisany przez `React.createElement`.
- Wygenerowane pliki ANTLR w `src/generated/` są ignorowane przez Git.
- Po przełączeniu commita lub zmianie gramatyki trzeba uruchomić `npm run generate`, aby parser odpowiadał aktualnej gramatyce.
