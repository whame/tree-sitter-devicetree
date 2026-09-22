/**
 * @file Devicetree grammar for tree-sitter
 * @author Waqar Hameed <whame@whame.dev>
 * @license GPL-3.0
 *
 * The C preprocessor grammar is based on the C grammar from the tree-sitter
 * project, which uses the MIT license:
 *
 * Copyright (c) 2014 Max Brunsfeld
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PROP_NODE_CHAR = "[a-zA-Z0-9,._+*#?@-]";
const PATH_CHAR = "(" + PROP_NODE_CHAR + "|/)";
const LABEL_CHAR = "[a-zA-Z_][a-zA-Z0-9_]*";

const PRECEDENCE = {
  CONDITIONAL: -1,
  DEFAULT: 0,
  LOGICAL_OR: 1,
  LOGICAL_AND: 2,
  BITWISE_OR: 3,
  BITWISE_XOR: 4,
  BITWISE_AND: 5,
  EQUAL: 6,
  RELATIONAL: 7,
  SHIFT: 8,
  ADD: 9,
  MULTIPLY: 10,
  UNARY: 11,
  CALL: 12,
};

export default grammar({
  name: "devicetree",

  // A preprocessor function call can be used as both node name or label
  // reference. prop_node_name and label_ref will match eagerly in those cases,
  // respectively. An external scanner is therefore needed to be able to do a
  // lookahead for the '(' in the function call.
  externals: $ => [$.preproc_function_name, $.preproc_function_name_ref],

  extras: $ => [
    /\s/,
    $.comment,
    /\\\n/,
  ],

  rules: {
    source_file: $ => repeat($._top_level_item),

    _top_level_item: $ => choice(
      $.header,
      $.memreserve,
      $.devicetree,

      // In the compiler, these are actually defined in the rule "devicetree"
      // (above). However, it makes more sense to have these seperated; they
      // don't actually have a tree node_def (and thus easier to distinguish
      // from actual trees when parsing).
      $.delete_node_ref,
      $.omit_node_ref,

      // An include file (.dtsi) can start with a subnode or properties. Diverge
      // from the compiler in this case.
      $.subnode,
      $.property,

      $._in_between_items,
      $.preproc_if,
      $.preproc_ifdef,
    ),

    _in_between_items: $ => choice(
      // The compiler actually recognizes the include directive anywhere during
      // lexing (and include the parts during parsing), but we only allow it in
      // _top_level_item and in node_def for simplicity. It is most often used
      // this way anyway...
      $.include,

      $.preproc_include,
      $.preproc_def,
      $.preproc_undef,
      $.preproc_function_def,
      $.preproc_call,
      $.preproc_function_call_statement,
    ),

    header: $ => choice(
      seq("/dts-v1/", ";"),
      seq("/plugin/", ";"),
    ),

    memreserve: $ => seq(
      repeat($.label),
      "/memreserve/",
      field("address", $._int_prim),
      field("length", $._int_prim),
      ";",
    ),

    include: $ => seq("/include/", $.string_literal),

    label: $ => choice(
      new RegExp(LABEL_CHAR + ":"),
      seq($.preproc_function_call, token.immediate(":")),
    ),
    label_ref: $ => choice(
      new RegExp("&" + LABEL_CHAR),
      alias($._preproc_function_call_ref, $.preproc_function_call),
    ),

    path_ref: $ => new RegExp("&\\{" + PATH_CHAR + "*\\}"),

    reference: $ => choice($.label_ref, $.path_ref),

    devicetree: $ => choice(
      seq("/", $.node_def),
      seq(
        optional($.label),
        $.reference,
        $.node_def,
      ),
    ),

    delete_node_ref: $ => seq("/delete-node/", $.reference, ";"),

    omit_node_ref: $ => seq("/omit-if-no-ref/", $.reference, ";"),

    node_def: $ => seq(
      "{",
      seq(
        repeat(seq(repeat($._in_between_items_node_def), $.property)),
        repeat(seq(repeat($._in_between_items_node_def), $.subnode)),
        repeat($._in_between_items_node_def),
      ),
      "}", ";"
    ),

    _in_between_items_node_def: $ => choice(
      $._in_between_items,
      $.preproc_if_in_node_def,
      $.preproc_ifdef_in_node_def,
    ),

    property: $ => seq(
      repeat($.label),
      choice(
        seq(field("name", $.prop_node_name), "=",
            seq($.prop_data, repeat(seq(",", $.prop_data))), ";"),
        seq(field("name", $.prop_node_name), ";"),
        $.delete_property,
      ),
    ),

    delete_property: $ => seq(
      "/delete-property/", field("name", $.prop_node_name), ";"
    ),

    prop_node_name: $ => new RegExp("\\\\?" + PROP_NODE_CHAR + "+"),
    prop_data: $ => seq(
      repeat($.label),
      choice(
        $.string_literal,
        seq(optional($.bits), $.array),
        $.bytestring,
        $.reference,
        $.incbin,
        $.preproc_identifier,
        $.preproc_function_call,
      ),
      repeat($.label)
    ),

    bits: $ => seq("/bits/", $.int_literal),

    array: $ => seq(
      "<",
      repeat(
        seq(
          repeat($.label),
          choice(
            $._int_prim,
            $.reference,
            $.preproc_ifdef_in_array,
          ),
        )
      ),
      repeat($.label),
      ">",
    ),

    bytestring: $ => seq(
      "[",
      repeat(
        seq(
          repeat($.label),
          $.byte
        )
      ),
      repeat($.label),
      "]"
    ),

    byte: $ => /[0-9a-fA-F]{2}/,

    incbin: $ => seq(
      "/incbin/",
      "(",
      $.string_literal,
      optional(seq(",", $._int_prim, ",", $._int_prim)),
      ")"
    ),

    subnode: $ => seq(
      repeat($.label),
      choice(
        seq(
          field("name",
                choice($.prop_node_name, $.preproc_function_call)),
          $.node_def
        ),
        $.delete_node,
        $.omit_node,
      )
    ),

    delete_node: $ => seq("/delete-node/", $.prop_node_name, ";"),

    omit_node: $ => seq("/omit-if-no-ref/", $.subnode),

    _int_prim: $ => choice(
      $.int_literal,
      $.char_literal,
      $.int_parenthesized_expression,
      $.preproc_identifier,
      $.preproc_function_call,
    ),

    int_parenthesized_expression: $ => seq("(", $._int_expr, ")"),

    _int_expr: $ => choice(
      $.int_literal,
      $.char_literal,
      $.int_unary_op,
      $.int_binary_op,
      $.int_ternary_op,
      $.int_parenthesized_expression,
      $.preproc_identifier,
      $.preproc_function_call,
    ),

    int_unary_op: $ => prec(PRECEDENCE.UNARY, seq(
      field("operator", choice("-", "~", "!")),
      field("argument", $._int_prim)
    )),

    int_binary_op: $ => {
      const OP_PRECEDENCE = [
        ["||", PRECEDENCE.LOGICAL_OR],
        ["&&", PRECEDENCE.LOGICAL_AND],
        ["|", PRECEDENCE.BITWISE_OR],
        ["^", PRECEDENCE.BITWISE_XOR],
        ["&", PRECEDENCE.BITWISE_AND],
        ["==", PRECEDENCE.EQUAL],
        ["!=", PRECEDENCE.EQUAL],
        ["<", PRECEDENCE.RELATIONAL],
        [">", PRECEDENCE.RELATIONAL],
        ["<=", PRECEDENCE.RELATIONAL],
        [">=", PRECEDENCE.RELATIONAL],
        ["<<", PRECEDENCE.SHIFT],
        [">>", PRECEDENCE.SHIFT],
        ["+", PRECEDENCE.ADD],
        ["-", PRECEDENCE.ADD],
        ["*", PRECEDENCE.MULTIPLY],
        ["/", PRECEDENCE.MULTIPLY],
        ["%", PRECEDENCE.MULTIPLY],
      ];

      return choice(
        ...OP_PRECEDENCE.map(([op, precedence]) => {
          return prec.left(
            precedence,
            seq($._int_expr, op, $._int_expr)
          );
        })
      );
    },

    int_ternary_op: $ => prec.right(PRECEDENCE.CONDITIONAL, seq(
      $._int_expr, "?", $._int_expr, ":", $._int_expr
    )),

    int_literal: $ => /([0-9]+|0[xX][0-9a-fA-F]+)(U|L|UL|LL|ULL)?/,

    // The pattern /'([^']|\\')*'/ wrapped in quotes and escaped (so editors can
    // parse it).
    char_literal: $ => new RegExp("'([^']|\\\\')*'"),

    // The pattern /"([^\\"]|\\.)*"/ wrapped in quotes and escaped (so editors
    // can parse it).
    string_literal: $ => new RegExp('"([^\\\\"]|\\\\.)*"'),

    comment: $ => token(
      choice(
        seq("/*", /([^*]|\*+[^*/])*\*+\//),
        // The compiler only recognizes "//.*". This is instead what the the C
        // preprocessor parses.
        seq("//", /(\\+(.|\r?\n)|[^\\\n])*/),
      )
    ),

    // C preprocesser.
    preproc_include: $ => seq(
      preprocessor("include"),
      field("path", choice(
        $.preproc_string_literal,
        $.system_lib_string,
        $.preproc_identifier,
        $.preproc_function_call,
      )),
      token.immediate(/[ \t]*\r?\n/),
    ),

    preproc_string_literal: $ => seq(
      choice('L"', 'u"', 'U"', 'u8"', '"'),
      repeat(choice(
        alias(token.immediate(prec(1, /[^\\"\n]+/)), $.string_content),
        $.escape_sequence,
      )),
      token.immediate('"'),
    ),

    escape_sequence: _ => token(prec(1, seq(
      "\\",
      choice(
        /[^xuU]/,
        /\d{2,3}/,
        /x[0-9a-fA-F]{1,4}/,
        /u[0-9a-fA-F]{4}/,
        /U[0-9a-fA-F]{8}/,
      ),
    ))),

    system_lib_string: _ => token(seq(
      "<",
      repeat(choice(/[^>\n]/, "\\>")),
      ">",
    )),

    preproc_def: $ => seq(
      preprocessor("define"),
      field("name", $.preproc_identifier),
      field("value", optional($.preproc_arg)),
      token.immediate(/[ \t]*\r?\n/),
    ),

    preproc_undef: $ => seq(
      preprocessor("undef"),
      field("name", $.preproc_identifier),
      token.immediate(/[ \t]*\r?\n/),
    ),

    preproc_function_def: $ => seq(
      preprocessor("define"),
      field("name", $.preproc_identifier),
      field("parameters", $.preproc_params),
      field("value", optional($.preproc_arg)),
      token.immediate(/[ \t]*\r?\n/),
    ),

    preproc_params: $ => seq(
      token.immediate("("),
      optional(seq(
        $._preproc_param,
        repeat(seq(",", $._preproc_param))
      )),
      ")",
    ),

    _preproc_param: $ => choice(
      $.preproc_identifier,
      seq($.preproc_identifier, token.immediate("...")),
      alias("...", $.preproc_identifier)
    ),

    preproc_call: $ => seq(
      field("directive", $.preproc_directive),
      field("argument", optional($.preproc_arg)),
      token.immediate(/[ \t]*\r?\n/),
    ),

    ...preprocIf("", $ => $._top_level_item),
    ...preprocIf("_in_node_def", $ => choice($.property, $.subnode)),
    ...preprocIf("_in_array", $ => seq(repeat($.label),
                                       choice($._int_prim, $.reference))),

    preproc_arg: _ => token(prec(-1, /\S(\/[^/*]|[^/\n]|\\\r?\n)*/)),

    // Since prop_node_name conflicts with a general directive (since
    // prop_node_name can start with '#' as well), explicitly list some commonly
    // used ones instead.
    preproc_directive: _ => token(
      prec(1, seq(
        /#[ \t]*/,
        choice("error", "pragma", "warning"),
        /\w*/))
    ),

    _preproc_expression: $ => choice(
      $.preproc_identifier,
      $.preproc_function_call,
      $.preproc_number_literal,
      $.preproc_char_literal,
      $.preproc_defined,
      $.preproc_unary_expression,
      $.preproc_binary_expression,
      $.preproc_parenthesized_expression,
    ),

    preproc_parenthesized_expression: $ => seq(
      "(",
      $._preproc_expression,
      ")",
    ),

    preproc_defined: $ => choice(
      prec(PRECEDENCE.CALL, seq("defined", "(", $.preproc_identifier, ")")),
      seq("defined", $.preproc_identifier),
    ),

    preproc_unary_expression: $ => prec.left(PRECEDENCE.UNARY, seq(
      field("operator", choice("!", "~", "-", "+")),
      field("argument", $._preproc_expression),
    )),

    preproc_function_call: $ => prec(PRECEDENCE.CALL, seq(
      field("function", alias($.preproc_function_name, $.preproc_identifier)),
      field("arguments", $.preproc_argument_list),
    )),

    _preproc_function_call_ref: $ => seq(
      field("function", alias($.preproc_function_name_ref,
                              $.preproc_identifier)),
      field("arguments", $.preproc_argument_list)
    ),

    preproc_function_call_statement: $ => seq(
      $.preproc_function_call, ";"
    ),

    preproc_argument_list: $ => seq(
      "(",
      optional(seq(
        $._preproc_argument,
        repeat(seq(",", $._preproc_argument))
      )),
      ")",
    ),

    preproc_binary_expression: $ => {
      const table = [
        ["+", PRECEDENCE.ADD],
        ["-", PRECEDENCE.ADD],
        ["*", PRECEDENCE.MULTIPLY],
        ["/", PRECEDENCE.MULTIPLY],
        ["%", PRECEDENCE.MULTIPLY],
        ["||", PRECEDENCE.LOGICAL_OR],
        ["&&", PRECEDENCE.LOGICAL_AND],
        ["|", PRECEDENCE.BITWISE_OR],
        ["^", PRECEDENCE.BITWISE_XOR],
        ["&", PRECEDENCE.BITWISE_AND],
        ["==", PRECEDENCE.EQUAL],
        ["!=", PRECEDENCE.EQUAL],
        [">", PRECEDENCE.RELATIONAL],
        [">=", PRECEDENCE.RELATIONAL],
        ["<=", PRECEDENCE.RELATIONAL],
        ["<", PRECEDENCE.RELATIONAL],
        ["<<", PRECEDENCE.SHIFT],
        [">>", PRECEDENCE.SHIFT],
      ];

      return choice(...table.map(([operator, precedence]) => {
        return prec.left(precedence, seq(
          field("left", $._preproc_expression),
          // @ts-ignore
          field("operator", operator),
          field("right", $._preproc_expression),
        ));
      }));
    },

    preproc_identifier: _ =>
      /(\p{XID_Start}|\$|_|\\u[0-9A-Fa-f]{4}|\\U[0-9A-Fa-f]{8})(\p{XID_Continue}|\$|-|\\u[0-9A-Fa-f]{4}|\\U[0-9A-Fa-f]{8})*/,

    preproc_number_literal: _ => {
      const separator = "'";
      const hex = /[0-9a-fA-F]/;
      const decimal = /[0-9]/;
      const hexDigits = seq(repeat1(hex), repeat(seq(separator, repeat1(hex))));
      const decimalDigits =
            seq(repeat1(decimal), repeat(seq(separator, repeat1(decimal))));
      return token(seq(
        optional(/[-\+]/),
        optional(choice(/0[xX]/, /0[bB]/)),
        choice(
          seq(
            choice(
              decimalDigits,
              seq(/0[bB]/, decimalDigits),
              seq(/0[xX]/, hexDigits),
            ),
            optional(seq(".", optional(hexDigits))),
          ),
          seq(".", decimalDigits),
        ),
        optional(seq(
          /[eEpP]/,
          optional(seq(
            optional(/[-\+]/),
            hexDigits,
          )),
        )),
        /[uUlLwWfFbBdD]*/,
      ));
    },

    preproc_char_literal: $ => seq(
      choice("L'", "u'", "U'", "u8'", "'"),
      repeat1(choice(
        $.escape_sequence,
        alias(token.immediate(/[^\n']/), $.character),
      )),
      "'",
    ),

    // Note that this must be ordered after preproc_number_literal due to
    // lexical conflicting rules.
    _preproc_argument: $ => choice(
      $._preproc_expression,
      // An argument to a call expression can actually start with a number
      // (compared to preproc_identifier).
      alias(/[0-9]+(\p{XID_Continue}|\$|-|\\u[0-9A-Fa-f]{4}|\\U[0-9A-Fa-f]{8})+/,
            $.preproc_identifier),
    ),
  }
});

function preprocIf(suffix, content, precedence = 0) {
  function alternativeBlock($) {
    return choice(
      $["preproc_elif" + suffix],
      $["preproc_elifdef" + suffix],
      $["preproc_else" + suffix],
    );
  }

  return {
    ["preproc_if" + suffix]: $ => prec(precedence, seq(
      preprocessor("if"),
      field("condition", $._preproc_expression),
      "\n",
      repeat(content($)),
      field("alternative", optional(alternativeBlock($))),
      preprocessor("endif"),
    )),

    ["preproc_ifdef" + suffix]: $ => prec(precedence, seq(
      choice(preprocessor("ifdef"), preprocessor("ifndef")),
      field("name", $.preproc_identifier),
      "\n",
      repeat(content($)),
      field("alternative", optional(alternativeBlock($))),
      preprocessor("endif"),
    )),

    ["preproc_elif" + suffix]: $ => prec(precedence, seq(
      preprocessor("elif"),
      field("condition", $._preproc_expression),
      "\n",
      repeat(content($)),
      field("alternative", optional(alternativeBlock($))),
    )),

    ["preproc_elifdef" + suffix]: $ => prec(precedence, seq(
      choice(preprocessor("elifdef"), preprocessor("elifndef")),
      field("name", $.preproc_identifier),
      "\n",
      repeat(content($)),
      field("alternative", optional(alternativeBlock($))),
    )),

    ["preproc_else" + suffix]: $ => prec(precedence, seq(
      preprocessor("else"),
      "\n",
      repeat(content($)),
    )),
  };
}

function preprocessor(command) {
  return alias(token(prec(1, new RegExp("#[ \t]*" + command))), "#" + command);
}
