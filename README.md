# gestalt-plugins

Plugins for [gestalts](../gestalts) apps that are content rather than part of the paradigm: the learning mini tools
of [loops-for-learning](../loops-for-learning), also loadable in the Gestalter. Each plugin is an interaction, and its
topics are decks: read-only starter notes, copied on write into the learner's notes. Decks holding the same thing
key it the same (a country by its ISO code), so a country two decks hold is one note, merged when both are mounted
(see gestalts' `doc/architecture.md`).

```
sam-learns/                                      ported from sam-learns-things
  alphabet-pronunciation-via-visual-cognates/    read a script aloud; decks: greek-alphabet
  learn-world-map/                               find countries on the map; decks: whole-world, africa
```

A plugin imports only the public packages (`@gestalts/sdk`, `kit`, `learning`) and never another plugin, so each
builds on its own (`mise run check` builds each so).

## Developing

Needs [mise](https://mise.jdx.dev), [rustup](https://rustup.rs) and a checkout of gestalts next to this one: until it
is published, the plugins link its packages by path, and its node lints and publishes the decks.

```
parent/
  gestalts/
  gestalt-plugins/
```

```sh
mise install                                   # once after cloning, and when mise.toml changes
mise run check                                 # lints, typechecks, tests, standalone builds, deck lints
mise run publish-data sam-learns/<plugin>/decks/<deck>  # after editing a deck by hand
mise run import-world-map [<sam-learns-things>]  # rebuild learn-world-map's decks
mise tasks                                     # everything else
```

To see a plugin in an app, run the app (`mise run dev` in loops-for-learning or the Gestalter): they link these
plugins by path, so they hot-reload.
