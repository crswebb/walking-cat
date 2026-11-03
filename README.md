# walking-cat

A cat for Claude Code that walks across the band above your prompt while Claude works.

- **A progress bar with paws.** The cat sets off when a reply starts, walks at the pace of your usual replies, slows down near the end, and sprints off the moment the work is done.
- **It tells you what's going on.** A speech bubble shows the current step ("Reading register.tsx", "Searching the web: …"), and a line below shows elapsed time, steps, model, effort, and tokens.
- **It asks for attention.** When Claude is waiting on a permission prompt or a question, the cat's eyes go wide and the bubble turns to a warning.
- **Kittens for subagents.** Each subagent gets its own kitten walking as its progress bar, with its task, time, and steps.
- **A receipt when done.** After the cat leaves, a short summary stays until your next message: time, steps, tokens, files read and edited, searches, commands, and agents.
- **Ten coats**, picked at random: orange, brown, silver, and cream tabby, Russian blue, black, tuxedo, Siamese, calico, and odd-eyed white.

In the Claude desktop app the cat and kittens are animated 8-bit pixel art; in the terminal they're ASCII art.

Type `/cat` to send the cat for a stroll.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install walking-cat --marketplace crswebb/walking-cat
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install walking-cat --marketplace crswebb/walking-cat
```

In the Claude desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `crswebb/walking-cat`, then **Add plugin**.

## Turning it off

```
claude plugin disable walking-cat
```
