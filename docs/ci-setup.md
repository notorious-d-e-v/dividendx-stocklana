# Enable GitHub Actions

The [CI definition](ci-workflow.yml) is backed up as an inactive template. The GitHub CLI login used for the initial backup can create repositories and push code, but GitHub rejected an active workflow because the OAuth token lacks `workflow` scope. Local fixture/SDK, build and browser checks already pass.

When ready to enable CI, complete GitHub's authorization flow:

```sh
gh auth refresh -h github.com -s workflow
```

Then activate the reviewed template in a normal commit:

```sh
mkdir -p .github/workflows
git mv docs/ci-workflow.yml .github/workflows/ci.yml
git commit -m "Enable verified GitHub Actions workflow"
git push
```

The workflow installs the root and transaction-SDK lockfiles on Node 24, checks fixtures/accounting and the transaction SDK, builds all three entry points, installs Chromium and runs the browser suite. It needs only `contents: read` at runtime. The real runtime/browser acceptance drivers are separate local checks; this template does not run them. Issuer keys, wallet keys and mainnet funds are not required.
