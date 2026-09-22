tree-sitter-devicetree
======================

Devicetree grammar for
[tree-sitter](https://github.com/tree-sitter/tree-sitter). The grammar is
directly ported from the
[Device Tree Compiler (dtc)](https://github.com/dgibson/dtc).

It also has (limited) support for the C preprocessor grammar. The goal here is
to be able to parse all Devicetree Source files in the
[Linux kernel source tree](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git).
The [test script](./test/parse.sh) can be used to verify this:

```
tree-sitter generate
./test/parse.sh /path/to/linux/
```

Copyright (C) 2026 Waqar Hameed and the tree-sitter-devictree contributors.
