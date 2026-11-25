# Repository coding guidance

- For the MongoDB Node.js driver 7.9+, avoid the deprecated two-argument `createIndex(indexSpec, options)` overload. Use `createIndexes([{ key: indexSpec, ...indexOptions }])` or the three-argument `createIndex(indexSpec, indexOptions, commandOptions)` overload. Check the installed driver's declarations and current MongoDB guidance before changing index code.
