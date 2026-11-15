// The JNI glue between NodeService.java and nodejs-mobile's libnode.so (Node 18 for Android).
// Built by android\build.ps1 with the Android NDK (clang, arm64-v8a, API 26) into
// lib/arm64-v8a/libbellatrixnode.so of the head APK only. No C++ library: it only calls node::Start.
//
//   NodeService.runNode(String[] args, String cwd, String logPath) -> Node's exit code
//   - chdir(cwd)                      the copy of the pages and modules (files/server/app)
//   - stdout and stderr -> logPath    (files/server/node.log, appended)
//   - node::Start(argc, argv)         argv in ONE block of memory, as Node and libuv expect
// Node runs until the server ends; it can start only once in a process (NodeService has its own).
#include <jni.h>
#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

namespace node {
int Start(int argc, char* argv[]);
}

extern "C" JNIEXPORT jint JNICALL
Java_de_labland_bellatrix_NodeService_runNode(JNIEnv* env, jclass, jobjectArray args, jstring cwd, jstring logPath) {
  if (cwd != nullptr) {
    const char* d = env->GetStringUTFChars(cwd, nullptr);
    if (d != nullptr) {
      if (chdir(d) != 0) { /* the script path is absolute: Node still finds it */ }
      env->ReleaseStringUTFChars(cwd, d);
    }
  }
  if (logPath != nullptr) {
    const char* p = env->GetStringUTFChars(logPath, nullptr);
    if (p != nullptr) {
      int fd = open(p, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0600);
      env->ReleaseStringUTFChars(logPath, p);
      if (fd >= 0) {
        dup2(fd, 1);
        dup2(fd, 2);
        close(fd);
      }
    }
  }

  jsize argc = env->GetArrayLength(args);
  if (argc <= 0) return -1;
  size_t total = 0;
  for (jsize i = 0; i < argc; i++) {
    jstring s = (jstring) env->GetObjectArrayElement(args, i);
    const char* c = env->GetStringUTFChars(s, nullptr);
    total += strlen(c) + 1;
    env->ReleaseStringUTFChars(s, c);
    env->DeleteLocalRef(s);
  }
  char* block = (char*) calloc(total, 1);
  char** argv = (char**) calloc((size_t) argc + 1, sizeof(char*));
  if (block == nullptr || argv == nullptr) return -1;
  char* at = block;
  for (jsize i = 0; i < argc; i++) {
    jstring s = (jstring) env->GetObjectArrayElement(args, i);
    const char* c = env->GetStringUTFChars(s, nullptr);
    size_t n = strlen(c);
    memcpy(at, c, n);
    at[n] = '\0';
    argv[i] = at;
    at += n + 1;
    env->ReleaseStringUTFChars(s, c);
    env->DeleteLocalRef(s);
  }
  argv[argc] = nullptr;
  // block and argv stay allocated: Node keeps pointers into them for the whole run.
  return node::Start((int) argc, argv);
}
