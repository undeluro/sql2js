# json-query-2-javascript

## Zespół
- Dzmitry Nikitsin — dnikitin@student.agh.edu.pl
- Niyaz Lapkouski - nlapkowski@student.agh.edu.pl

## Założenia programu
Translator zapytań SQL-like dla danych zapisanych w formacie JSON.  
Użytkownik podaje zapytanie w uproszczonym DSL inspirowanym SQL oraz plik/zmienną JSON, a program wykonuje pełny pipeline kompilatorski: lekser → parser → AST → analiza semantyczna → generacja kodu JavaScript.

## Ogólne cele programu
Program umożliwia wykonywanie zapytań na danych JSON poprzez tłumaczenie ich do kodu JavaScript.

## Rodzaj translatora
Kompilator (translator do kodu docelowego JS).

## Pipeline
```
zapytanie DSL
    │
    ▼
 Lexer (ANTLR4)          ← tokeny
    │
    ▼
 Parser (ANTLR4)         ← drzewo rozbioru (Parse Tree)
    │
    ▼
 AST Visitor             ← własne węzły AST
    │
    ▼
 Semantic Analyzer       ← sprawdzanie ścieżek, typów, UNNEST
    │
    ▼
 Code Generator          ← kod JavaScript
    │
    ▼
 Wykonanie JS na danych JSON → wynik (JSON / terminal)
```

## Planowany wynik działania programu
Generator kodu JavaScript realizującego zapytanie na pliku JSON.

## Planowany język implementacji
JavaScript.

## Generator parsera
ANTLR4.

---

## Kluczowe decyzje semantyczne

| Kwestia | Decyzja |
|---|---|
| Nawigacja przez zagnieżdżone **obiekty** | Dozwolona bezpośrednio: `address.city` |
| Nawigacja przez **tablice** | Wymaga jawnego `UNNEST(pole) AS alias` |
| Agregatów | `COUNT`, `SUM`, `AVG`, `MIN`, `MAX` — operują na tablicy wewnątrz rekordu |
| Joinów | Prosty `JOIN ... ON` — łączenie dwóch źródeł JSON po warunku |
| Wynik | Wewnętrznie lista obiektów JS; eksport jako JSON lub wydruk do terminala |

---

## Wspierane zapytania — przykłady

```sql
-- Prosty filtr z zagnieżdżoną ścieżką
SELECT name, address.city FROM users WHERE age > 18 ORDER BY name ASC LIMIT 10

-- Rozwinięcie tablicy przez UNNEST
SELECT name, tag FROM users UNNEST(tags) AS tag WHERE tag = 'admin'

-- Zliczanie elementów tablicy (agregat na poziomie rekordu)
SELECT name, COUNT(orders) FROM customers WHERE COUNT(orders) > 3

-- Inne funkcje agregujące na tablicach
SELECT name, SUM(orders.total), AVG(orders.total) FROM customers
WHERE MAX(orders.total) > 100

-- Złożone warunki i sortowanie po głębokiej ścieżce
SELECT id, profile.bio FROM users
WHERE age >= 21 AND profile.active = true
ORDER BY profile.score DESC
LIMIT 5

-- Prosty JOIN dwóch źródeł JSON
SELECT u.name, o.product, o.total
FROM users AS u
JOIN orders AS o ON u.id = o.userId
WHERE o.total > 100
ORDER BY o.total DESC
```

---

## Opis tokenów

Tokeny są podzielone na cztery kategorie: **słowa kluczowe**, **literały**, **identyfikatory** i **operatory/znaki przestankowe**.  
Wszystkie słowa kluczowe są **case-insensitive** (obsługa na poziomie leksera przez klasy znaków ANTLR4).  
Białe znaki i komentarze liniowe (`--`) są pomijane (nie trafiają do strumienia tokenów).

### Słowa kluczowe

| Token | Wzorzec (regex) | Opis |
|---|---|---|
| `SELECT` | `[Ss][Ee][Ll][Ee][Cc][Tt]` | Rozpoczyna listę projekcji |
| `FROM` | `[Ff][Rr][Oo][Mm]` | Określa źródło danych |
| `WHERE` | `[Ww][Hh][Ee][Rr][Ee]` | Filtrowanie wierszy |
| `ORDER` | `[Oo][Rr][Dd][Ee][Rr]` | Sortowanie (razem z `BY`) |
| `BY` | `[Bb][Yy]` | Część `ORDER BY` |
| `LIMIT` | `[Ll][Ii][Mm][Ii][Tt]` | Ograniczenie liczby wyników |
| `UNNEST` | `[Uu][Nn][Nn][Ee][Ss][Tt]` | Rozwinięcie tablicy do wierszy |
| `AS` | `[Aa][Ss]` | Alias wyrażenia lub rozwinięcia |
| `AND` | `[Aa][Nn][Dd]` | Koniunkcja logiczna |
| `OR` | `[Oo][Rr]` | Alternatywa logiczna |
| `NOT` | `[Nn][Oo][Tt]` | Negacja logiczna (prefiks) |
| `ASC` | `[Aa][Ss][Cc]` | Sortowanie rosnące |
| `DESC` | `[Dd][Ee][Ss][Cc]` | Sortowanie malejące |
| `COUNT` | `[Cc][Oo][Uu][Nn][Tt]` | Agregat: liczba elementów tablicy |
| `SUM` | `[Ss][Uu][Mm]` | Agregat: suma elementów tablicy |
| `AVG` | `[Aa][Vv][Gg]` | Agregat: średnia elementów tablicy |
| `MIN_F` | `[Mm][Ii][Nn]` | Agregat: minimum tablicy |
| `MAX_F` | `[Mm][Aa][Xx]` | Agregat: maksimum tablicy |
| `NULL` | `[Nn][Uu][Ll][Ll]` | Literał null |
| `JOIN` | `[Jj][Oo][Ii][Nn]` | Łączenie dwóch źródeł JSON |
| `ON` | `[Oo][Nn]` | Warunek łączenia w JOIN |

### Literały

| Token | Wzorzec (regex) | Przykłady | Opis |
|---|---|---|---|
| `BOOLEAN_LIT` | `true\|false` (case-insensitive) | `true`, `False`, `TRUE` | Wartość logiczna |
| `INTEGER_LIT` | `[0-9]+` | `0`, `42`, `1000` | Liczba całkowita bez znaku |
| `FLOAT_LIT` | `[0-9]+'.'[0-9]*` lub `'.'[0-9]+` | `3.14`, `.5`, `2.` | Liczba zmiennoprzecinkowa bez znaku |
| `STRING_LIT` | `"..."` lub `'...'` z obsługą `\`-escape | `"hello"`, `'world'`, `"O\'Brien"` | Łańcuch znaków |

### Identyfikatory

| Token | Wzorzec (regex) | Opis |
|---|---|---|
| `IDENTIFIER` | `[a-zA-Z_][a-zA-Z_0-9]*` | Nazwa zmiennej, pola, aliasu. Słowa kluczowe mają pierwszeństwo przy identycznym dopasowaniu. |

### Operatory i znaki przestankowe

| Token | Leksem | Opis |
|---|---|---|
| `EQ` | `=` | Równość |
| `NEQ` | `!=` | Nierówność |
| `LT` | `<` | Mniejszy niż |
| `GT` | `>` | Większy niż |
| `LEQ` | `<=` | Mniejszy lub równy |
| `GEQ` | `>=` | Większy lub równy |
| `PLUS` | `+` | Dodawanie |
| `MINUS` | `-` | Odejmowanie / negacja unaryczna |
| `STAR` | `*` | Mnożenie / SELECT * |
| `SLASH` | `/` | Dzielenie |
| `LPAREN` | `(` | Nawias otwierający |
| `RPAREN` | `)` | Nawias zamykający |
| `COMMA` | `,` | Separator elementów listy |
| `DOT` | `.` | Separator segmentów ścieżki |
| `SEMICOLON` | `;` | Separator zapytań |

### Tokeny pomijane

| Token | Wzorzec | Opis |
|---|---|---|
| `WS` | `[ \t\r\n]+` | Białe znaki — pomijane |
| `LINE_COMMENT` | `'--' [^\r\n]*` | Komentarz liniowy — pomijany |

---

## Gramatyka w notacji ANTLR4

Pełny plik gramatyki: [grammar/JsonQuery.g4](grammar/JsonQuery.g4)

Poniżej opis struktury gramatyki z komentarzem do kluczowych decyzji.

### Reguły parsera

```antlr
grammar JsonQuery;

program
    : query+ EOF
    ;

query
    : selectStmt SEMICOLON
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

selectList
    : STAR                                  # SelectAll
    | selectItem (COMMA selectItem)*        # SelectItems
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

// Priorytety operatorów: w ANTLR4 dla reguł lewostronnie
// rekurencyjnych PIERWSZA alternatywa = NAJWYŻSZY priorytet.
expr
    : primary                               # PrimaryExpr
    | MINUS expr                            # UnaryMinus
    | expr (STAR  | SLASH) expr             # MulExpr
    | expr (PLUS  | MINUS) expr             # AddExpr
    | expr compOp expr                      # CompareExpr
    | NOT expr                              # NotExpr
    | expr AND expr                         # AndExpr
    | expr OR  expr                         # OrExpr
    ;

primary
    : aggFunc LPAREN path RPAREN           # AggExpr
    | path                                  # PathExpr
    | literal                               # LiteralExpr
    | LPAREN expr RPAREN                    # ParenExpr
    ;

aggFunc
    : COUNT | SUM | AVG | MIN_F | MAX_F
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

compOp
    : EQ | NEQ | LT | GT | LEQ | GEQ
    ;
```

### Reguły leksera

```antlr
// Słowa kluczowe (case-insensitive, przed IDENTIFIER)
SELECT  : [Ss][Ee][Ll][Ee][Cc][Tt] ;
FROM    : [Ff][Rr][Oo][Mm] ;
WHERE   : [Ww][Hh][Ee][Rr][Ee] ;
ORDER   : [Oo][Rr][Dd][Ee][Rr] ;
BY      : [Bb][Yy] ;
LIMIT   : [Ll][Ii][Mm][Ii][Tt] ;
UNNEST  : [Uu][Nn][Nn][Ee][Ss][Tt] ;
AS      : [Aa][Ss] ;
AND     : [Aa][Nn][Dd] ;
OR      : [Oo][Rr] ;
NOT     : [Nn][Oo][Tt] ;
ASC     : [Aa][Ss][Cc] ;
DESC    : [Dd][Ee][Ss][Cc] ;
COUNT   : [Cc][Oo][Uu][Nn][Tt] ;
SUM     : [Ss][Uu][Mm] ;
AVG     : [Aa][Vv][Gg] ;
MIN_F   : [Mm][Ii][Nn] ;
MAX_F   : [Mm][Aa][Xx] ;
NULL    : [Nn][Uu][Ll][Ll] ;
JOIN    : [Jj][Oo][Ii][Nn] ;
ON      : [Oo][Nn] ;

BOOLEAN_LIT : [Tt][Rr][Uu][Ee] | [Ff][Aa][Ll][Ss][Ee] ;

IDENTIFIER  : [a-zA-Z_] [a-zA-Z_0-9]* ;

FLOAT_LIT   : [0-9]+ '.' [0-9]* | '.' [0-9]+ ;
INTEGER_LIT : [0-9]+ ;
STRING_LIT  : '"'  ( ~["\\] | '\\' . )* '"'
            | '\'' ( ~['\\] | '\\' . )* '\''
            ;

// Operatory (wieloznakowe przed jednoznakowymi)
STAR    : '*' ;   COMMA   : ',' ;   DOT     : '.' ;   SEMICOLON : ';' ;
LPAREN  : '(' ;   RPAREN  : ')' ;
PLUS    : '+' ;   MINUS   : '-' ;   SLASH   : '/' ;
LEQ     : '<=' ;  GEQ     : '>=' ;  NEQ     : '!=' ;
EQ      : '='  ;  LT      : '<'  ;  GT      : '>'  ;

// Pomijane
WS          : [ \t\r\n]+  -> skip ;
LINE_COMMENT : '--' ~[\r\n]* -> skip ;
```

### Priorytety i łączność operatorów (podsumowanie)

| Poziom | Operatory | Łączność |
|---|---|---|
| 1 (najniższy) | `OR` | lewostronna |
| 2 | `AND` | lewostronna |
| 3 | `NOT` | prawostronna (prefiks) |
| 4 | `=` `!=` `<` `>` `<=` `>=` | brak łączności (nieporównywalne) |
| 5 | `+` `-` | lewostronna |
| 6 | `*` `/` | lewostronna |
| 7 | unarny `-` | prawostronna (prefiks) |
| 8 (najwyższy) | `COUNT(...)`, ścieżka, literał, `(...)` | — |

---

## Instalacja i uruchomienie

### Wymagania
- Node.js ≥ 18
- Java (do generacji parsera z ANTLR4)

### Instalacja
```bash
# Zainstaluj zależności
npm install

# Wygeneruj lexer/parser z gramatyki (wymaga Java)
java -jar antlr-4.13.1-complete.jar -Dlanguage=JavaScript -visitor -no-listener -o src/generated grammar/JsonQuery.g4
```

### Tryb interaktywny (TUI)
```bash
# Z podaniem pliku danych
node src/index.js -d data/users.json

# Bez pliku — TUI poprosi o ścieżkę
node src/index.js
```

### Tryb jednorazowy
```bash
# Wykonaj zapytanie i wydrukuj wynik jako JSON
node src/index.js -e "SELECT name, age FROM users WHERE age > 18;" -d data/users.json

# Wykonaj zapytanie i pokaĹĽ teĹĽ wygenerowany kod JavaScript
node src/index.js -e "SELECT name FROM users LIMIT 1;" -d data/users.json --debug

# Z JOIN
node src/index.js -e "SELECT u.name, o.product FROM users AS u JOIN orders AS o ON u.id = o.userId;" -d data/users.json -j data/orders.json
```

### Pomoc
```bash
node src/index.js --help
```

### Przykłady diagnostyki błędów

Poniższe komendy celowo zawierają błędy i pokazują podział diagnostyki na fazy: `lexical`, `syntax`, `semantic`, `runtime`.

```bash
# Błąd leksykalny: znak @ nie należy do języka zapytań
node src/index.js -e "SELECT name FROM users WHERE age > @;" -d data/users.json

# Błąd składniowy: brakuje FROM po liście SELECT
node src/index.js -e "SELECT name users;" -d data/users.json

# Błąd semantyczny: alias u został zadeklarowany dwa razy
node src/index.js -e "SELECT u.name FROM users AS u JOIN orders AS u ON u.id = u.id;" -d data/users.json -j data/orders.json

# Błąd runtime: data jest katalogiem, a program wymaga pliku .json
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

## Użyte technologie

| Komponent | Technologia |
|---|---|
| Generator parsera | ANTLR4 |
| Język implementacji | JavaScript (ESM) |
| Runtime | Node.js |
| TUI | Ink (React for terminals) |
| Kolory terminala | chalk |

