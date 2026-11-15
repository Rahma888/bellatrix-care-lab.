plugins { id("org.jetbrains.kotlin.jvm") }

// Same sources as robot/navigation in Vergil, compiled for Java 8 class files
// so that a plain `javac --release 8` build can put the jar on its classpath.
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_1_8) } }
java { sourceCompatibility = JavaVersion.VERSION_1_8; targetCompatibility = JavaVersion.VERSION_1_8 }

tasks.jar { archiveFileName.set("vergil-navigation.jar") }

val stdlib by configurations.creating
dependencies {
    testImplementation(kotlin("test"))
    stdlib("org.jetbrains.kotlin:kotlin-stdlib:2.0.20") { isTransitive = false }
}
tasks.register<Copy>("copyStdlib") { from(stdlib); into(layout.buildDirectory.dir("stdlib")) }
tasks.test { useJUnitPlatform() }
