grammar JsonQuery;

// ========================
// Parser Rules
// ========================

program
    : statement+ EOF
    ;

statement
    : selectStmt SEMICOLON         # SelectStatement
    | createStmt SEMICOLON         # CreateStatement
    | insertStmt SEMICOLON         # InsertStatement
    | updateStmt SEMICOLON         # UpdateStatement
    | deleteStmt SEMICOLON         # DeleteStatement
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
    | objectLiteral                         # ObjectExpr
    | arrayLiteral                          # ArrayExpr
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

compOp
    : EQ | NEQ | LT | GT | LEQ | GEQ
    ;

// ========================
// Lexer Rules
// ========================

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
CREATE  : [Cc][Rr][Ee][Aa][Tt][Ee] ;
COLLECTION : [Cc][Oo][Ll][Ll][Ee][Cc][Tt][Ii][Oo][Nn] ;
INSERT  : [Ii][Nn][Ss][Ee][Rr][Tt] ;
INTO    : [Ii][Nn][Tt][Oo] ;
VALUE   : [Vv][Aa][Ll][Uu][Ee] ;
UPDATE  : [Uu][Pp][Dd][Aa][Tt][Ee] ;
SET     : [Ss][Ee][Tt] ;
DELETE  : [Dd][Ee][Ll][Ee][Tt][Ee] ;

BOOLEAN_LIT : [Tt][Rr][Uu][Ee] | [Ff][Aa][Ll][Ss][Ee] ;

IDENTIFIER  : [a-zA-Z_] [a-zA-Z_0-9]* ;

FLOAT_LIT   : [0-9]+ '.' [0-9]* | '.' [0-9]+ ;
INTEGER_LIT : [0-9]+ ;
STRING_LIT  : '"'  ( ~["\\] | '\\' . )* '"'
            | '\'' ( ~['\\] | '\\' . )* '\''
            ;

// Operatory (wieloznakowe przed jednoznakowymi)
LEQ     : '<=' ;
GEQ     : '>=' ;
NEQ     : '!=' ;
EQ      : '='  ;
LT      : '<'  ;
GT      : '>'  ;
PLUS    : '+' ;
MINUS   : '-' ;
STAR    : '*' ;
SLASH   : '/' ;
LPAREN  : '(' ;
RPAREN  : ')' ;
LBRACE  : '{' ;
RBRACE  : '}' ;
LBRACK  : '[' ;
RBRACK  : ']' ;
COMMA   : ',' ;
DOT     : '.' ;
COLON   : ':' ;
SEMICOLON : ';' ;

// Pomijane
WS          : [ \t\r\n]+  -> skip ;
LINE_COMMENT : '--' ~[\r\n]* -> skip ;
