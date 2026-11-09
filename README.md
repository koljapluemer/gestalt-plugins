# gestalt-plugins

Plugins for [gestalts](../gestalts) apps that are content rather than part of the paradigm: the learning views of
[loops-for-learning](../loops-for-learning), also installable in gestalter.

```
sam-learns/
  alphabet-pronunciation-trainer/    read a script aloud; decks: greek-alphabet
```

A plugin is a folder ([gestalts' `doc/plugins.md`](../gestalts/doc/plugins.md)). Decks are read-only, and two decks that
hold the same id are merged, so a concept shared between them keeps the relations of both.

`alphabet-pronunciation-trainer/tools/build_greek_deck.py` generates the Greek deck's flashcards and concepts. What a Greek
"letter" is lives there, and only there.

## Developing

Needs [mise](https://mise.jdx.dev), [rustup](https://rustup.rs) and a checkout of gestalts next to this one: until it
is published, this repo links its packages by path, and its node checks and publishes the decks.

```
parent/
  gestalts/
  gestalt-plugins/
```

```sh
mise install                                   # once after cloning, and when mise.toml changes
mise run check                                 # lints, typechecks, tests, deck health
mise run publish-data sam-learns/<plugin>/decks/<deck>  # after editing a deck by hand
mise tasks                                     # everything else
```

To see a plugin in an app, run the app (`mise run dev` in loops-for-learning or gestalter): they link these
plugins by path, so they hot-reload.
