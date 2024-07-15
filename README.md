# vanilla-mcdoc
The vanilla definition files using the schema format, [mcdoc](https://github.com/SpyglassMC/Spyglass/tree/main/packages/mcdoc), for describing data structures used by Minecraft, including its CODECs, JSONs, and NBTs

Format documentation: https://spyglassmc.com/user/mcdoc/

Informal linting rules:
- Avoid unnecessary/implied doc comments and doc comment contents.
- If a string union changes between mc updates use a string enum instead.
- Always name structs that are dispatched to.
- Always name nested structs unless they are a string map.
- Avoid repetitive code.
- Avoid nesting structs further than 3 levels deep.
- Prefer descriptive, useful, & succinct struct/type alias names, otherwise provide ample dev comments.

Based on original schema repositories:
- [mc-nbtdoc](https://github.com/Yurihaia/mc-nbtdoc)
- [minecraft-schemas](https://github.com/misode/minecraft-schemas)
