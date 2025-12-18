# block-merge-conflicts

Check the changed files and block a Pull Request if the merge conflict markers are found.

The action uses GitHub API to get the list of changed files

## Inputs

### `token`

**Required** GitHub Token.

## Example

```yaml
- uses: actions/checkout@v4
- uses: Dannybevers/block-merge-conflicts@1.3.5
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
```
