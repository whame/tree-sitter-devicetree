#include "tree_sitter/parser.h"

enum TokenType {
  PREPROC_FUNCTION_NAME,
  PREPROC_FUNCTION_NAME_REF,
};

static bool is_space(char ch) {
    return ch == ' ' || ch == '\t' || ch == '\n' || ch == '\v' || ch == '\f' ||
           ch == '\r';
}

static bool is_alpha(char ch) {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
}

static bool is_digit(char ch) {
  return ch >= '0' && ch <= '9';
}

static bool is_preproc_identifer_char(char ch) {
  return is_alpha(ch) || is_digit(ch) || ch == '_';
}

static bool is_preproc_function_name(TSLexer* lexer) {
  while (!lexer->eof(lexer) && is_preproc_identifer_char(lexer->lookahead)) {
    lexer->advance(lexer, false);
  }

  // While the preprocessor allows whitespace between the function name and the
  // first opening parenthesis, we have to be stricter. This is because we can't
  // really distinguish between an actual function call (e.g. "FOO(BAR + BAZ)")
  // and just preprocessor defines in series (e.g. "FOO (BAR + BAZ)"). The
  // assumption is therefore that a function call never has a whitespace between
  // the function name and the argument.
  if (lexer->lookahead == '(') {
    return true;
  }

  return false;
}

bool tree_sitter_devicetree_external_scanner_scan(
  __attribute__((unused)) void* payload, TSLexer* lexer,
  const bool* valid_symbols) {
  // Skip initial whitespace.
  while (!lexer->eof(lexer) && is_space(lexer->lookahead)) {
    lexer->advance(lexer, true);
  }

  // Only valid character to start with for PREPROC_FUNCTION_NAME_REF.
  if (lexer->lookahead == '&') {
    if (!valid_symbols[PREPROC_FUNCTION_NAME_REF]) {
      return false;
    }

    lexer->advance(lexer, false);
    lexer->result_symbol = PREPROC_FUNCTION_NAME_REF;
    return is_preproc_function_name(lexer);
  }

  // Valid characters to start with for PREPROC_FUNCTION_NAME.
  if (!is_alpha(lexer->lookahead) && lexer->lookahead != '_') {
    return false;
  }

  if (valid_symbols[PREPROC_FUNCTION_NAME]) {
    lexer->result_symbol = PREPROC_FUNCTION_NAME;
    return is_preproc_function_name(lexer);
  }

  return false;
}

void* tree_sitter_devicetree_external_scanner_create() {
  return NULL;
}

void tree_sitter_devicetree_external_scanner_destroy(
  __attribute__((unused)) void* payload) {
}

unsigned int tree_sitter_devicetree_external_scanner_serialize(
  __attribute__((unused)) void* payload,
  __attribute__((unused)) char* buffer) {
  return 0;
}

void tree_sitter_devicetree_external_scanner_deserialize(
  __attribute__((unused)) void* payload,
  __attribute__((unused)) const char* buffer,
  __attribute__((unused)) unsigned int length) {
}
