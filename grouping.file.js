const {
  listOfFolder,
  listFile,
  isInteger,
  createFolder,
  moveFile,
  _error,
} = require("./lib/library");
const { state } = require("./lib/state");
const path = require("path");

state.rootDir = path.join("C:/Users/PROG2/Documents/dest", "downloadBox");

const createFolderByFilteredDate = async (arrayOfFile) => {
  try {
    // creating folder
    const folders = [...new Set(arrayOfFile.map((item) => item.path))];
    const year = await Promise.all(
      [
        ...new Set(
          folders.map((item) => item.split("/").filter((item) => item)?.[0])
        ),
      ].map(async (item) => await createFolder(path.join(state.rootDir, item)))
    );
    const child = await Promise.all(
      folders.map(
        async (item) => await createFolder(path.join(state.rootDir, item))
      )
    );

    if (![...year, ...child].every((item) => item === true))
      throw _error("Error", "Failed to create folder");

    console.log("Creating folder done");
  } catch (error) {
    throw error;
  }
};

const groupingFirstDate = (arrayOfFile) => {
  // filtering by folder date
  return arrayOfFile
    .map((item) => {
      const date = item.split("_")?.[0]?.split("-");
      if (date?.length <= 1) return;
      return { path: `/${date?.[0]}/${date?.[1]}`, name: item };
    })
    .filter((item) => item);
};

const grouping = (arrayOfFile) => {
  return arrayOfFile
    .map((item) => {
      const date = item?.split("_")?.slice(-3)[0]?.split("-");
      if (date?.length <= 1) return;
      return { path: `/${date?.[0]}/${date?.[1]}`, name: item };
    })
    .filter((item) => item);
};

(async () => {
  try {
    console.clear();
    process.stdout.write(
      "\r Getting File Information on folder " + state.rootDir
    );
    // listing file
    let _listFile = listFile(state.rootDir, { get: ["name"] });

    console.clear();
    console.log(`Total File: ${_listFile.length}`);

    _listFile = _listFile.reduce(
      (current, item, index) => {
        process.stdout.write(
          `\r Grouping File By Date ${index}/${_listFile.length}`
        );
        return isInteger(item?.[0])
          ? { ...current, method1: [...current.method1, item] }
          : { ...current, method2: [...current.method2, item] };
      },
      { method1: [], method2: [] }
    );

    console.clear();
    process.stdout.write("\r Grouping File By Date");
    _listFile = [
      ...groupingFirstDate(_listFile?.method1),
      ...grouping(_listFile?.method2),
    ];

    // create Folder
    console.log("Creating Folder ...");
    await createFolderByFilteredDate(_listFile);

    // moving file
    console.clear();
    console.log("Moving File");
    let total = 0;
    const result = await Promise.all(
      _listFile.map(async (item) => {
        const result = await moveFile(
          path.join(state.rootDir, item.name),
          path.join(state.rootDir, item.path, item.name)
        );

        total++;
        process.stdout.write(`\r Moving File ${total}/${_listFile.length}`);

        return result;
      })
    );

    if (result.every((item) => item === true)) {
      console.clear();
      console.log("Grouping File By Date Done");

      return;
    }

    throw _error("Error", "Failed to move file");
  } catch (error) {
    console.clear();
    console.log(error);
  }

  global?.gc(); // freeup memory
})();
