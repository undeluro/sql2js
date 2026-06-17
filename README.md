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
| Agregaty grupowe | `COUNT`, `SUM`, `AVG`, `MIN`, `MAX` operują na wierszach wyniku, z obsługą `GROUP BY`, `HAVING` i `COUNT(*)`. |
| Funkcje tablicowe | `ARRAY_COUNT`, `ARRAY_SUM`, `ARRAY_AVG`, `ARRAY_MIN`, `ARRAY_MAX` operują na tablicach wewnątrz pojedynczego rekordu. |
| JOIN | `INNER`, `LEFT`, `RIGHT`, `FULL` oraz `NATURAL JOIN` między kolekcjami. |
| Wynik `SELECT *` po JOIN | Pola techniczne aliasów są ukryte; konflikty z prawej strony dostają prefiks aliasu, np. `p.id`. |
| Operacje zbiorowe | `UNION`, `INTERSECT`, `EXCEPT` działają bez duplikatów; końcowe `ORDER BY` i `LIMIT` dotyczą całego wyniku. |
| Dopasowanie tekstu | `LIKE` jest czuły na wielkość liter, `ILIKE` ignoruje wielkość liter; `%` i `_` są wildcardami. |
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

-- Funkcja tablicowa na tablicy wewnątrz rekordu
SELECT name, ARRAY_COUNT(orders) FROM customers WHERE ARRAY_COUNT(orders) > 3;

-- Agregat grupowy po wierszach
SELECT address.city, COUNT(*), AVG(age)
FROM users
GROUP BY address.city
HAVING COUNT(*) > 1;

-- JOIN dwóch kolekcji
SELECT u.name, o.product, o.total
FROM users AS u
JOIN orders AS o ON u.id = o.userId
WHERE o.total > 100
ORDER BY o.total DESC;

-- LEFT JOIN zachowuje rekordy z lewej kolekcji bez dopasowania
SELECT *
FROM users AS u
LEFT JOIN orders AS o ON u.id = o.userId;

-- NATURAL JOIN dopasowuje po wspólnych polach najwyższego poziomu
SELECT *
FROM lefts NATURAL JOIN rights;

-- Operacje zbiorowe są domyślnie bez duplikatów
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

## Rozszerzone przykłady użycia

Poniższe przykłady pokazują typowe scenariusze testowania kompilatora i runtime'u. Zapytania można uruchamiać w TUI albo przez `-e`, np.:

```bash
node src/index.js -e "SELECT name FROM users LIMIT 3;" -d data/users.json
```

### Filtrowanie, sortowanie i aliasy

```sql
-- Projekcja z aliasami kolumn
SELECT name AS userName, age AS userAge
FROM users
WHERE age >= 18
ORDER BY age DESC
LIMIT 5;

-- Warunek z AND, OR, NOT i nawiasami
SELECT name, age, profile.score
FROM users
WHERE (age > 25 AND profile.active = true) OR NOT address.city = 'Warszawa'
ORDER BY profile.score DESC;

-- Porównanie tekstu czułe i nieczułe na wielkość liter
SELECT name FROM users WHERE name LIKE 'Ali%';
SELECT email FROM users WHERE email ILIKE '%@EXAMPLE.COM';
SELECT name FROM users WHERE name NOT ILIKE 'ewa%';
```

### Pola zagnieżdżone, tablice i agregaty

```sql
-- Bezpośredni dostęp do pól obiektów
SELECT name, address.city, profile.active
FROM users
WHERE profile.score >= 80;

-- Rozwinięcie tablicy na wiele wierszy
SELECT name, tag
FROM users
UNNEST(tags) AS tag
WHERE tag = 'developer';

-- Funkcje tablicowe na tablicach wewnątrz rekordu
SELECT name, ARRAY_COUNT(orders)
FROM users
WHERE ARRAY_COUNT(orders) > 2;

-- Funkcje tablicowe na polu obiektu w tablicy
SELECT name, ARRAY_SUM(orders.total), ARRAY_AVG(orders.total), ARRAY_MIN(orders.total), ARRAY_MAX(orders.total)
FROM users
ORDER BY name ASC;

-- Agregaty grupowe po wierszach
SELECT address.city, COUNT(*), SUM(age), AVG(age), MIN(age), MAX(age)
FROM users
GROUP BY address.city
HAVING COUNT(*) > 1
ORDER BY address.city ASC;

-- Łączenie obu poziomów: najpierw suma tablicy w rekordzie, potem suma po grupie
SELECT address.city, SUM(ARRAY_SUM(orders.total))
FROM users
GROUP BY address.city;

-- COUNT(*) liczy wszystkie wiersze po filtrze WHERE
SELECT COUNT(*)
FROM users
WHERE age >= 18;

-- COUNT(pole) liczy tylko wiersze, w których pole nie jest null / missing
SELECT COUNT(email), COUNT(profile.score)
FROM users;

-- SUM / AVG / MIN / MAX bez GROUP BY zwracają jeden wiersz dla całej kolekcji
SELECT COUNT(*), SUM(age), AVG(age), MIN(age), MAX(age)
FROM users;

-- Grupowanie po jednym polu zagnieżdżonym
SELECT address.city, COUNT(*), AVG(age)
FROM users
GROUP BY address.city;

-- Grupowanie po kilku kluczach
SELECT address.city, profile.active, COUNT(*), MIN(age), MAX(age)
FROM users
GROUP BY address.city, profile.active
ORDER BY address.city ASC;

-- HAVING filtruje już policzone grupy, a nie pojedyncze rekordy
SELECT address.city, COUNT(*), AVG(age)
FROM users
GROUP BY address.city
HAVING COUNT(*) >= 2 AND AVG(age) > 25;

-- COUNT(*) można łączyć z COUNT(pole), żeby wykryć brakujące wartości
SELECT address.city, COUNT(*), COUNT(email)
FROM users
GROUP BY address.city
HAVING COUNT(*) > COUNT(email);

-- ARRAY_COUNT działa na tablicy w pojedynczym rekordzie
SELECT name, ARRAY_COUNT(tags), ARRAY_COUNT(orders)
FROM users
WHERE ARRAY_COUNT(tags) > 0;

-- ARRAY_SUM / ARRAY_AVG / ARRAY_MIN / ARRAY_MAX na tablicy liczb
CREATE COLLECTION metrics FROM [
  { id: 1, scores: [10, 20, 30] },
  { id: 2, scores: [5, 15] },
  { id: 3, scores: [] }
];

SELECT id, ARRAY_SUM(scores), ARRAY_AVG(scores), ARRAY_MIN(scores), ARRAY_MAX(scores)
FROM metrics;

-- ARRAY_* na polu obiektu w tablicy, np. orders.total
SELECT name,
       ARRAY_SUM(orders.total),
       ARRAY_AVG(orders.total),
       ARRAY_MIN(orders.total),
       ARRAY_MAX(orders.total)
FROM users;

-- Agregacja grupowa po wartościach policzonych z tablic w rekordach
SELECT address.city,
       COUNT(*),
       SUM(ARRAY_SUM(orders.total)),
       AVG(ARRAY_COUNT(orders)),
       MAX(ARRAY_MAX(orders.total))
FROM users
GROUP BY address.city
HAVING SUM(ARRAY_SUM(orders.total)) > 100;

-- JOIN + agregacja: suma zamówień i liczba zamówień na użytkownika
SELECT u.name, COUNT(*), SUM(o.total), AVG(o.total), MIN(o.total), MAX(o.total)
FROM users AS u
JOIN orders AS o ON u.id = o.userId
GROUP BY u.name
HAVING SUM(o.total) > 100;

-- UNNEST + agregacja: najczęściej występujące tagi
SELECT tag, COUNT(*)
FROM users
UNNEST(tags) AS tag
GROUP BY tag
HAVING COUNT(*) > 1
ORDER BY tag ASC;

-- Niepoprawne: agregaty grupowe nie działają w WHERE, do tego służy HAVING
SELECT address.city, COUNT(*)
FROM users
WHERE COUNT(*) > 1
GROUP BY address.city;

-- Niepoprawne: pole poza agregatem musi być w GROUP BY
SELECT address.city, name, COUNT(*)
FROM users
GROUP BY address.city;

-- Niepoprawne: ARRAY_SUM wymaga tablicy, nie zwykłej liczby
SELECT ARRAY_SUM(age)
FROM users;
```

### Mutacje danych

```sql
-- Utworzenie nowej kolekcji
CREATE COLLECTION tasks FROM [
  { id: 1, title: 'Parser', done: false },
  { id: 2, title: 'Codegen', done: false }
];

-- Dodanie rekordu
INSERT INTO tasks VALUE { id: 3, title: 'Tests', done: false };

-- Aktualizacja jednego lub wielu rekordów
UPDATE tasks
SET done = true
WHERE title = 'Parser';

-- Aktualizacja pola zagnieżdżonego
UPDATE users
SET profile.score = profile.score + 1
WHERE profile.active = true;

-- Usunięcie rekordów spełniających warunek
DELETE FROM tasks
WHERE done = true;
```

W TUI mutacje zapisują się automatycznie do aktywnej bazy. W trybie CLI trzeba dodać `--save`, jeśli wynik ma nadpisać plik z `-d`:

```bash
node src/index.js -e "INSERT INTO users VALUE { id: 99, name: 'Test', age: 20 };" -d data/users.json --save
```

### JOIN różnych typów

Do przykładów z osobnym plikiem zamówień można użyć:

```bash
node src/index.js -e "SELECT u.name, o.product FROM users AS u JOIN orders AS o ON u.id = o.userId;" -d data/users.json -j data/orders.json
```

```sql
-- Domyślny JOIN działa jak INNER JOIN
SELECT u.name, o.product, o.total
FROM users AS u
JOIN orders AS o ON u.id = o.userId;

-- Jawny INNER JOIN
SELECT u.name, o.product
FROM users AS u
INNER JOIN orders AS o ON u.id = o.userId
WHERE o.total > 1000;

-- LEFT JOIN zachowuje wszystkich użytkowników z lewej strony
SELECT u.name, o.product
FROM users AS u
LEFT JOIN orders AS o ON u.id = o.userId;

-- RIGHT JOIN zachowuje wszystkie rekordy z prawej strony
SELECT u.name, o.product
FROM users AS u
RIGHT JOIN orders AS o ON u.id = o.userId;

-- FULL JOIN zachowuje niedopasowane rekordy z obu stron
SELECT u.name, o.product
FROM users AS u
FULL JOIN orders AS o ON u.id = o.userId;

-- SELECT * po JOIN ukrywa pola techniczne aliasów
-- Konflikty nazw z prawej strony dostają prefiks aliasu, np. o.id
SELECT *
FROM users AS u
LEFT OUTER JOIN orders AS o ON u.id = o.userId;

-- Pola z prawej strony można pisać przez alias
SELECT u.name, o.status, o.total
FROM users AS u
JOIN orders AS o ON u.id = o.userId;

-- Unikalne, niekonfliktujące pola z prawej strony mogą być użyte bez aliasu
SELECT name, product, total
FROM users AS u
JOIN orders AS o ON u.id = o.userId;
```

### NATURAL JOIN

`NATURAL JOIN` dopasowuje rekordy po wspólnych polach najwyższego poziomu. Przykładowa baza:

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
-- Dopasowanie po wspólnych polach id oraz code
SELECT *
FROM lefts NATURAL JOIN rights;

-- Warianty zewnętrzne też są obsługiwane
SELECT leftValue, rightValue
FROM lefts NATURAL LEFT JOIN rights;

SELECT leftValue, rightValue
FROM lefts NATURAL FULL JOIN rights;
```

### Operacje zbiorowe i unikalność wyników

Projekt nie ma osobnego słowa kluczowego `UNIQUE`. Operacje `UNION`, `INTERSECT` i `EXCEPT` działają jak operacje zbiorowe, czyli usuwają duplikaty wierszy na podstawie wartości JSON.

```sql
-- UNION: suma wyników bez duplikatów
SELECT name FROM users
UNION
SELECT name FROM customers
ORDER BY name;

-- INTERSECT: tylko wspólne wiersze
SELECT name FROM users
INTERSECT
SELECT name FROM customers;

-- EXCEPT: wiersze z lewej strony, których nie ma po prawej
SELECT name FROM users
EXCEPT
SELECT name FROM customers
ORDER BY name
LIMIT 10;

-- Duplikaty są usuwane dla całych obiektów wynikowych
SELECT name, age FROM users
UNION
SELECT name, age FROM users;
```

### Skrypty `.s2j`

Plik `commands.s2j` może zawierać wiele instrukcji wykonywanych po kolei:

```sql
CREATE COLLECTION people FROM [{ id: 1, name: 'Ala', age: 20 }];
INSERT INTO people VALUE { id: 2, name: 'Ola', age: 21 };
UPDATE people SET age = age + 1 WHERE id = 2;
SELECT name, age FROM people ORDER BY id ASC;
```

Uruchomienie z zapisem zmian:

```bash
node src/index.js -f commands.s2j -d db.json --save
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
| `GROUP` | `[Gg][Rr][Oo][Uu][Pp]` | Grupowanie wyników. |
| `HAVING` | `[Hh][Aa][Vv][Ii][Nn][Gg]` | Warunek po agregacji grup. |
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
| `COUNT` | `[Cc][Oo][Uu][Nn][Tt]` | Liczba wierszy lub nie-nullowych wartości w grupie. |
| `SUM` | `[Ss][Uu][Mm]` | Suma wartości w grupie. |
| `AVG` | `[Aa][Vv][Gg]` | Średnia wartości w grupie. |
| `MIN_F` | `[Mm][Ii][Nn]` | Minimum wartości w grupie. |
| `MAX_F` | `[Mm][Aa][Xx]` | Maksimum wartości w grupie. |
| `ARRAY_COUNT` | `ARRAY_COUNT` case-insensitive | Liczba elementów tablicy w pojedynczym rekordzie. |
| `ARRAY_SUM` | `ARRAY_SUM` case-insensitive | Suma elementów tablicy w pojedynczym rekordzie. |
| `ARRAY_AVG` | `ARRAY_AVG` case-insensitive | Średnia elementów tablicy w pojedynczym rekordzie. |
| `ARRAY_MIN` | `ARRAY_MIN` case-insensitive | Minimum tablicy w pojedynczym rekordzie. |
| `ARRAY_MAX` | `ARRAY_MAX` case-insensitive | Maksimum tablicy w pojedynczym rekordzie. |
| `NULL` | `[Nn][Uu][Ll][Ll]` | Literał null. |
| `JOIN` | `[Jj][Oo][Ii][Nn]` | Łączenie kolekcji. |
| `ON` | `[Oo][Nn]` | Warunek JOIN. |
| `INNER` | `[Ii][Nn][Nn][Ee][Rr]` | Jawny inner join. |
| `LEFT`, `RIGHT`, `FULL` | case-insensitive | Zewnętrzne warianty JOIN. |
| `OUTER` | `[Oo][Uu][Tt][Ee][Rr]` | Opcjonalne słowo w `LEFT/RIGHT/FULL OUTER JOIN`. |
| `NATURAL` | `[Nn][Aa][Tt][Uu][Rr][Aa][Ll]` | JOIN po wspólnych polach. |
| `UNION` | `[Uu][Nn][Ii][Oo][Nn]` | Suma zbiorów wyników. |
| `INTERSECT` | `[Ii][Nn][Tt][Ee][Rr][Ss][Ee][Cc][Tt]` | Część wspólna wyników. |
| `EXCEPT` | `[Ee][Xx][Cc][Ee][Pp][Tt]` | Różnica wyników. |
| `LIKE` | `[Ll][Ii][Kk][Ee]` | Dopasowanie wzorca czułe na wielkość liter. |
| `ILIKE` | `[Ii][Ll][Ii][Kk][Ee]` | Dopasowanie wzorca ignorujące wielkość liter. |
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
    : expr (AS IDENTIFIER)?
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
- `Ctrl+O` — wybór lub zmiana aktywnej bazy danych,
- `Ctrl+D` — pokazanie albo ukrycie wygenerowanego kodu JavaScript,
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

# Błąd leksykalny: niedozwolony znak w wyrażeniu
node src/index.js -e "SELECT name FROM users WHERE age # 18;" -d data/users.json

# Błąd składniowy
node src/index.js -e "SELECT name users;" -d data/users.json

# Błąd składniowy: brak średnika w pliku skryptu
node src/index.js -f broken-script.s2j -d db.json

# Błąd semantyczny
node src/index.js -e "SELECT missingField FROM users;" -d data/users.json

# Błąd semantyczny: nieistniejąca kolekcja
node src/index.js -e "SELECT name FROM missing;" -d data/users.json

# Błąd semantyczny: INSERT do nieistniejącej kolekcji
node src/index.js -e "INSERT INTO missing VALUE { id: 1 };" -d data/users.json

# Błąd semantyczny: UPDATE nieistniejącego pola przy znanym schemacie
node src/index.js -e "UPDATE users SET missingField = 1 WHERE id = 1;" -d data/users.json

# Błąd semantyczny: UNNEST wymaga tablicy
node src/index.js -e "SELECT name FROM users UNNEST(age) AS item;" -d data/users.json

# Błąd semantyczny: funkcja ARRAY_* wymaga tablicy
node src/index.js -e "SELECT ARRAY_SUM(age) FROM users;" -d data/users.json

# Błąd semantyczny: agregat grupowy nie może być użyty w WHERE
node src/index.js -e "SELECT name FROM users WHERE COUNT(*) > 1;" -d data/users.json

# Błąd semantyczny: zwykłe pole w SELECT musi wystąpić w GROUP BY
node src/index.js -e "SELECT address.city, name, COUNT(*) FROM users GROUP BY address.city;" -d data/users.json

# Błąd semantyczny: JOIN wymaga warunku ON, jeśli nie jest NATURAL JOIN
node src/index.js -e "SELECT * FROM users JOIN orders;" -d data/users.json -j data/orders.json

# Błąd semantyczny: NATURAL JOIN bez wspólnych pól najwyższego poziomu
node src/index.js -e "SELECT * FROM lefts NATURAL JOIN unrelated;" -d natural.json

# Błąd runtime
node src/index.js -e "SELECT name FROM users;" -d data

# Błąd runtime: niepoprawny JSON w pliku bazy
node src/index.js -e "SELECT name FROM users;" -d broken.json

# Błąd argumentów CLI: -e i -f są wzajemnie wykluczające
node src/index.js -e "SELECT * FROM users;" -f commands.s2j -d data/users.json
```

Przykładowy format błędu:

```text
[syntax] at 1:12: missing FROM at 'users'
  SELECT name users;
              ^
  expected: FROM
  offending text: "users"
```

Rozróżnienie faz błędów pomaga wskazać, gdzie zatrzymał się pipeline:

| Faza | Co oznacza | Przykład |
|---|---|---|
| `lexical` | Lexer nie potrafi rozpoznać znaku lub tokenu. | `@`, `#` w wyrażeniu. |
| `syntax` | Parser dostał poprawne tokeny, ale w złej kolejności. | `SELECT name users;` |
| `semantic` | Zapytanie ma poprawną składnię, ale nie zgadza się ze schematem lub regułami języka. | Nieznana kolekcja, zły `UNNEST`, brak `ON` w `JOIN`. |
| `compiletime` | Błąd podczas budowy AST albo generowania JavaScriptu. | Nieobsłużony typ węzła AST. |
| `runtime` | Kod został wygenerowany, ale nie udało się załadować lub przetworzyć danych. | Katalog zamiast pliku `.json`, uszkodzony JSON. |

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
- regresję dla wariantów `JOIN`, `NATURAL JOIN`, operacji zbiorowych, `LIKE`/`ILIKE`, `UNNEST`, funkcji `ARRAY_*`, agregatów grupowych, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT`.

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
