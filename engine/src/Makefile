# Builds the portfolio command engine to WebAssembly.
#
#   lexer.l  --flex-->  lex.yy.c   \
#   parser.y --bison--> parser.tab.c  >--emcc-->  engine.js + engine.wasm
#   cJSON.c  ------------------------/
#
# Requires Emscripten (emcc), Flex and Bison on the PATH. Run `make` here.
# The output goes to frontend/src/wasm/; copy engine.js and engine.wasm into
# frontend-vanilla/js/wasm/ as well if you change the engine.

CC = emcc
CFLAGS = -g -Wall

OBJECTS = parser.tab.o lex.yy.o cJSON.o

TARGET_JS = ../../frontend/src/wasm/engine.js
TARGET_WASM = ../../frontend/src/wasm/engine.wasm

# Emscripten flags:
#   EXPORTED_FUNCTIONS       C functions JavaScript may call (process_command)
#   EXPORTED_RUNTIME_METHODS helpers JS uses to call them with strings (cwrap)
#   MODULARIZE + EXPORT_ES6  output an ES module whose default export creates the engine
#   MALLOC=emmalloc          a smaller allocator; this engine allocates very little
EM_FLAGS = \
	-s WASM=1 \
	-s EXPORTED_FUNCTIONS="['_process_command']" \
	-s EXPORTED_RUNTIME_METHODS="['cwrap', 'UTF8ToString']" \
	-s ALLOW_MEMORY_GROWTH=1 \
	-s MALLOC=emmalloc \
	-s MODULARIZE=1 \
	-s EXPORT_ES6=1 \
	-s EXPORT_NAME='WasmEngine'

all: $(TARGET_JS)

# Link everything into engine.js (+ engine.wasm next to it).
$(TARGET_JS): $(OBJECTS)
	$(CC) $(CFLAGS) $(EM_FLAGS) -o $(TARGET_JS) $(OBJECTS)

# Bison generates the parser and the token definitions (parser.tab.h)...
parser.tab.c parser.tab.h: parser.y
	bison -d parser.y

# ...which the Flex lexer includes.
lex.yy.c: lexer.l parser.tab.h
	flex -o lex.yy.c lexer.l

parser.tab.o: parser.tab.c
	$(CC) $(CFLAGS) -c parser.tab.c

lex.yy.o: lex.yy.c
	$(CC) $(CFLAGS) -c lex.yy.c

cJSON.o: cJSON.c cJSON.h
	$(CC) $(CFLAGS) -c cJSON.c

clean:
	rm -f *.o lex.yy.c parser.tab.c parser.tab.h $(TARGET_JS) $(TARGET_WASM)
